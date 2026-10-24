import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ownerProfileSelect, profileView } from "../profile/profile.service.js";
import { evaluateManualVerificationEligibility } from "../profile/manual-verification.eligibility.js";
import { processIdentityImage, IDENTITY_MAX_BYTES, IDENTITY_IMAGE_TYPES } from "./manual-identity.image.js";

export const MANUAL_IDENTITY_CONSENT = "manual-identity-upload-v1";
const TTL = 24 * 3600000;
const fail = (status, message) => Object.assign(new Error(message), { status });
const publicSelect = { id: true, kind: true, state: true, expiresAt: true, createdAt: true };
function validAccount(accountId) {
  if (typeof accountId !== "string" || !accountId.trim()) throw fail(401, "Please log in to continue.");
}
export function createManualIdentityEvidenceService({ prisma, storage, now = () => new Date(), processImage = processIdentityImage }) {
  let active = 0;
  async function owner(db, accountId) {
    validAccount(accountId);
    const account = await db.account.findUnique({ where: { id: accountId }, select: { id: true, personId: true, status: true } });
    if (!account || account.status !== "ACTIVE") throw fail(401, "Please log in to continue.");
    return account;
  }
  async function eligible(db, account) {
    const row = await db.profile.findUnique({ where: { personId: account.personId }, select: ownerProfileSelect });
    const profile = profileView(row);
    const result = evaluateManualVerificationEligibility(profile, profile.completion.complete);
    if (!result.requirementsMet) throw fail(403, "Complete your profile and verify at least one education and one experience record first.");
  }
  return {
    async list(accountId) {
      await owner(prisma, accountId);
      return prisma.manualIdentityEvidence.findMany({ where: { accountId, state: "READY", expiresAt: { gt: now() } },
        select: publicSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 6 });
    },
    async upload(accountId, kind, bytes, type, consentVersion) {
      validAccount(accountId);
      if (!["GOVERNMENT_ID", "SELFIE"].includes(kind) || consentVersion !== MANUAL_IDENTITY_CONSENT || !IDENTITY_IMAGE_TYPES.includes(type)) {
        throw fail(400, "Choose an ID or selfie image and acknowledge the identity upload notice.");
      }
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > IDENTITY_MAX_BYTES) throw fail(413, "Choose an identity image up to 5 MiB.");
      if (active >= 2) throw fail(503, "Identity uploads are busy. Please retry.");
      active++;
      let reservation;
      try {
        storage.check();
        reservation = await prisma.$transaction(async (tx) => {
          // Serialize reservations for this account; expensive decoding/storage stays outside the transaction.
          const locked = await tx.account.updateMany({ where: { id: accountId, status: "ACTIVE" }, data: { status: "ACTIVE" } });
          if (locked.count !== 1) throw fail(401, "Please log in to continue.");
          const account = await owner(tx, accountId);
          await eligible(tx, account);
          const timestamp = now();
          const budget = await tx.manualIdentityUploadBudget.findUnique({ where: { accountId } });
          const sameWindow = budget && +timestamp - +budget.windowStart < 3600000;
          if (sameWindow && budget.count >= 20) throw fail(429, "Identity upload limit reached. Try again later.");
          const pending = await tx.manualIdentityEvidence.count({ where: { accountId, state: { in: ["UPLOADING", "READY"] }, expiresAt: { gt: timestamp } } });
          if (pending >= 6) throw fail(409, "Remove an unused identity image before uploading another.");
          await tx.manualIdentityUploadBudget.upsert({ where: { accountId },
            create: { accountId, windowStart: timestamp, count: 1 },
            update: { windowStart: sameWindow ? budget.windowStart : timestamp, count: sameWindow ? budget.count + 1 : 1 } });
          const id = randomUUID();
          return tx.manualIdentityEvidence.create({ data: { id, accountId, kind, state: "UPLOADING",
            storageKey: `manual-identity/${randomUUID()}.webp`, consentVersion,
            consentedAt: timestamp, expiresAt: new Date(+timestamp + TTL) } });
        });
        const image = await processImage(bytes, type);
        await storage.put(reservation.storageKey, image.bytes, "image/webp");
        // Account status and expiry are checked again after slow network work.
        await prisma.$transaction(async (tx) => {
          const locked = await tx.account.updateMany({ where: { id: accountId, status: "ACTIVE" }, data: { status: "ACTIVE" } });
          if (locked.count !== 1) throw fail(401, "Please log in to continue.");
          const saved = await tx.manualIdentityEvidence.updateMany({
            where: { id: reservation.id, accountId, state: "UPLOADING", expiresAt: { gt: now() } },
            data: { state: "READY", size: image.bytes.length, width: image.width, height: image.height },
          });
          if (saved.count !== 1) throw fail(409, "This upload expired or was removed. Upload it again.");
        });
        return { id: reservation.id, kind, state: "READY", expiresAt: reservation.expiresAt };
      } catch (error) {
        if (reservation) {
          // A failed storage write may still have created an object. Keep a durable cleanup record.
          // Also covers an ambiguous READY commit whose response was lost before it reached the caller.
          try { await prisma.manualIdentityEvidence.updateMany({ where: { id: reservation.id, state: { in: ["UPLOADING", "READY"] } }, data: { state: "DELETE_PENDING" } }); }
          catch { /* Expired UPLOADING/READY rows are also found by cleanup. */ }
        }
        throw error;
      } finally { active--; }
    },
    async read(accountId, id) {
      await owner(prisma, accountId);
      if (!z.uuid().safeParse(id).success) throw fail(404, "Identity image not found.");
      const row = await prisma.manualIdentityEvidence.findFirst({ where: { id, accountId, state: "READY", expiresAt: { gt: now() } } });
      if (!row) throw fail(404, "Identity image not found.");
      const bytes = await storage.get(row.storageKey, { maxBytes: IDENTITY_MAX_BYTES });
      // Prevent a slow storage read from returning evidence removed while it was in flight.
      await owner(prisma, accountId);
      if (!await prisma.manualIdentityEvidence.findFirst({ where: { id, accountId, state: "READY", expiresAt: { gt: now() } }, select: { id: true } })) throw fail(404, "Identity image not found.");
      return { bytes, kind: row.kind };
    },
    async remove(accountId, id) {
      await owner(prisma, accountId);
      if (!z.uuid().safeParse(id).success) throw fail(404, "Identity image not found.");
      const removed = await prisma.manualIdentityEvidence.updateMany({ where: { id, accountId, state: { in: ["UPLOADING", "READY", "DELETE_PENDING"] } }, data: { state: "DELETE_PENDING" } });
      if (removed.count !== 1) throw fail(404, "Identity image not found.");
      return { removed: true };
    },
    async cleanup() {
      // Do not process in-flight puts immediately; the storage adapter has a 30-second request deadline.
      const cutoff = new Date(+now() - 10 * 60000);
      const rows = await prisma.manualIdentityEvidence.findMany({ where: { OR: [
        { state: "DELETE_PENDING", updatedAt: { lt: cutoff } },
        { state: { in: ["UPLOADING", "READY"] }, expiresAt: { lt: cutoff } },
      ] }, orderBy: { createdAt: "asc" }, take: 100 });
      let deleted = 0, failed = 0;
      for (const row of rows) {
        // CAS excludes records attached by the later submission workflow.
        const claim = await prisma.manualIdentityEvidence.updateMany({ where: { id: row.id, state: row.state, updatedAt: row.updatedAt }, data: { state: "DELETE_PENDING" } });
        if (!claim.count) continue;
        try {
          await storage.delete(row.storageKey);
          await prisma.manualIdentityEvidence.updateMany({ where: { id: row.id, state: "DELETE_PENDING" }, data: { state: "DELETED" } });
          deleted++;
        } catch { failed++; }
      }
      return { deleted, failed };
    },
  };
}
