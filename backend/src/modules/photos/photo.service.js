import { createProfilePhotoReviewService } from "./profile-photo-review.service.js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { processPhoto, processCoverPhoto } from "./photo.image.js";

export const draftHash = (token) => createHash("sha256").update(token).digest("hex");
export const validDraftToken = (token) => typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
export const DRAFT_LIFETIME_MS = 30 * 60 * 1000;
const error = (status, message) => Object.assign(new Error(message), { status });

export function createPhotoService({ prisma, storage, process = processPhoto, processCover = processCoverPhoto, now = () => new Date() }) {
  const replacements = createProfilePhotoReviewService({ prisma, storage, now });
  async function draft(token) {
    if (!validDraftToken(token)) throw error(401, "Start signup again to upload a photo.");
    const row = await prisma.signupDraft.findUnique({ where: { tokenHash: draftHash(token) } });
    if (!row || row.expiresAt <= now()) throw error(401, "Your signup draft expired. Please retry.");
    return row;
  }
  async function upload(owner, bytes, type, prepared) {
    storage.check();
    const image = prepared ?? await process(bytes, type);
    const asset = await prisma.photoAsset.create({ data: {
      ...owner, storageKey: `profile-photos/${randomUUID()}.webp`,
      expiresAt: new Date(now().getTime() + DRAFT_LIFETIME_MS),
    } });
    try {
      await storage.put(asset.storageKey, image.bytes);
      const updated = await prisma.photoAsset.updateMany({ where: {
        id: asset.id, state: "UPLOADING", expiresAt: { gt: now() },
      }, data: { state: "READY", byteSize: image.bytes.length, width: image.width, height: image.height } });
      if (updated.count !== 1) throw error(409, "Photo upload expired. Please retry.");
      return asset;
    } catch (failure) {
      await prisma.photoAsset.updateMany({ where: { id: asset.id, state: { in: ["UPLOADING", "READY"] } }, data: { state: "DELETE_PENDING" } }).catch(() => {});
      throw failure;
    }
  }
  return {
    async begin(token) {
      storage.check();
      if (validDraftToken(token)) {
        const existing = await prisma.signupDraft.findUnique({ where: { tokenHash: draftHash(token) } });
        if (existing?.expiresAt > now()) return { token, expiresAt: existing.expiresAt };
      }
      const next = randomBytes(32).toString("hex");
      const expiresAt = new Date(now().getTime() + DRAFT_LIFETIME_MS);
      await prisma.signupDraft.create({ data: { tokenHash: draftHash(next), expiresAt } });
      return { token: next, expiresAt };
    },
    async uploadDraft(token, bytes, type) {
      const row = await draft(token);
      storage.check();
      const prepared = await process(bytes, type);
      const reservation = await prisma.signupDraft.updateMany({ where: {
        id: row.id, expiresAt: { gt: now() }, uploadCount: { lt: 3 },
      }, data: { uploadCount: { increment: 1 } } });
      if (reservation.count !== 1) {
        throw error(429, "This signup draft has reached its photo limit. Try again after it expires.");
      }
      const asset = await upload({ draftId: row.id }, bytes, type, prepared);
      return { photoAssetId: asset.id };
    },
    async registerAsset(assetId, token, createAccount, { countryCode } = {}) {
      const owner = await draft(token);
      return prisma.$transaction(async (tx) => {
        // A waiting request may have captured its expiry cutoff before this
        // transaction. Consume with a fixed past value, not a newer wall-clock
        // timestamp that could still satisfy that request's WHERE predicate.
        const consumed = await tx.signupDraft.updateMany({ where: { id: owner.id, expiresAt: { gt: now() } },
          data: { expiresAt: new Date(0) } });
        if (consumed.count !== 1) throw error(400, "Your signup draft has already been used or expired.");
        const claimed = await tx.photoAsset.updateMany({ where: {
          id: assetId, draftId: owner.id, state: "READY", personId: null,
          expiresAt: { gt: now() },
        }, data: { state: "CLAIMED" } });
        if (claimed.count !== 1) throw error(400, "Select and upload a new photo for this signup.");
        const account = await createAccount(tx);
        await tx.photoAsset.update({ where: { id: assetId }, data: { personId: account.person.id } });
        await tx.profile.create({ data: { personId: account.person.id, photoId: assetId, countryCode } });
        // Invalidates this capability without leaking the token to responses.
        return account;
      });
    },
    async uploadOwner(personId, expectedVersion, bytes, type) {
      const asset = await upload({ personId }, bytes, type);
      try {
        return await prisma.$transaction((tx) => replacements.applyReplacement(tx, personId, expectedVersion, asset));
      } catch (failure) {
        await prisma.photoAsset.updateMany({ where: { id: asset.id, state: "READY" }, data: { state: "DELETE_PENDING" } }).catch(() => {});
        if (failure.code === "P2002") throw error(409, "Reload your profile before uploading again.");
        throw failure;
      }
    },
    async uploadCover(personId, expectedVersion, bytes, type) {
      const prepared = await processCover(bytes, type);
      const asset = await upload({ personId }, bytes, type, prepared);
      try {
        return await prisma.$transaction(async tx => {
          const row = await tx.profile.findUnique({
            where: { personId }, select: { id: true, version: true, coverPhotoId: true },
          });
          if (!row || row.version !== expectedVersion) throw error(409, "Your profile changed. Reload it before changing your cover photo.");
          if ((await tx.photoAsset.updateMany({
            where: { id: asset.id, personId, state: "READY", expiresAt: { gt: now() } },
            data: { state: "CLAIMED" },
          })).count !== 1) throw error(409, "Cover photo upload expired. Please retry.");
          if ((await tx.profile.updateMany({
            where: { personId, version: expectedVersion },
            data: { coverPhotoId: asset.id, version: { increment: 1 } },
          })).count !== 1) throw error(409, "Your profile changed. Reload it before changing your cover photo.");
          if (row.coverPhotoId) await tx.photoAsset.updateMany({
            where: { id: row.coverPhotoId, personId, state: "CLAIMED" },
            data: { state: "DELETE_PENDING" },
          });
          return { coverPhotoId: asset.id, profileVersion: expectedVersion + 1 };
        });
      } catch (failure) {
        await prisma.photoAsset.updateMany({
          where: { id: asset.id, personId, state: "READY" },
          data: { state: "DELETE_PENDING" },
        }).catch(() => {});
        throw failure;
      }
    },
    async removeCover(personId, expectedVersion) {
      return prisma.$transaction(async tx => {
        const row = await tx.profile.findUnique({ where: { personId }, select: { version: true, coverPhotoId: true } });
        if (!row || row.version !== expectedVersion) throw error(409, "Your profile changed. Reload it before changing your cover photo.");
        if (!row.coverPhotoId) return { coverPhotoId: null, profileVersion: row.version };
        if ((await tx.profile.updateMany({
          where: { personId, version: expectedVersion },
          data: { coverPhotoId: null, version: { increment: 1 } },
        })).count !== 1) throw error(409, "Your profile changed. Reload it before changing your cover photo.");
        await tx.photoAsset.updateMany({
          where: { id: row.coverPhotoId, personId, state: "CLAIMED" },
          data: { state: "DELETE_PENDING" },
        });
        return { coverPhotoId: null, profileVersion: expectedVersion + 1 };
      });
    },
    async readCover(viewerId, username, assetId) {
      async function authorizedCover() {
        const owner = await prisma.account.findUnique({
          where: { username },
          select: {
            id: true, status: true, personId: true,
            person: { select: { profile: { select: { coverPhotoId: true } } } },
          },
        });
        if (!owner || owner.status !== "ACTIVE" || owner.person?.profile?.coverPhotoId !== assetId)
          throw error(404, "Cover photo not found.");
        if (viewerId !== owner.id) {
          const [leftAccountId, rightAccountId] = [viewerId, owner.id].sort();
          const relationship = await prisma.networkPair.findUnique({
            where: { leftAccountId_rightAccountId: { leftAccountId, rightAccountId } },
            select: { leftBlocked: true, rightBlocked: true },
          });
          if (relationship?.leftBlocked || relationship?.rightBlocked) throw error(404, "Cover photo not found.");
        }
        return owner;
      }
      const owner = await authorizedCover();
      const asset = await prisma.photoAsset.findFirst({
        where: { id: assetId, personId: owner.personId, state: "CLAIMED" },
        select: { storageKey: true },
      });
      if (!asset) throw error(404, "Cover photo not found.");
      const bytes = await storage.get(asset.storageKey, { maxBytes: 3 * 1024 * 1024 });
      await authorizedCover();
      return bytes;
    },
    async readOwner(personId, assetId) {
      const asset = await prisma.photoAsset.findFirst({ where: { id: assetId, personId, state: "CLAIMED" }, select: { storageKey: true } });
      if (!asset) throw error(404, "Photo not found.");
      return storage.get(asset.storageKey);
    },
    async cleanup() {
      // Mark by a conditional state/expiry update; concurrent claims win or lose atomically.
      await prisma.photoAsset.updateMany({ where: { state: { in: ["UPLOADING", "READY"] },
        expiresAt: { lt: new Date(now().getTime() - 5 * 60 * 1000) } }, data: { state: "DELETE_PENDING" } });
      const pending = await prisma.photoAsset.findMany({ where: { state: "DELETE_PENDING" }, take: 100, orderBy: { updatedAt: "asc" } });
      let deleted = 0;
      for (const asset of pending) {
        // Never delete the current profile photo.
        const referenced = await prisma.profile.count({ where: { OR: [{ photoId: asset.id }, { coverPhotoId: asset.id }] } });
        if (referenced) continue;
        await storage.delete(asset.storageKey);
        await prisma.photoAsset.updateMany({ where: { id: asset.id, state: "DELETE_PENDING" }, data: { state: "DELETED" } });
        deleted++;
      }
      return { deleted };
    },
  };
}
