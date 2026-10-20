import { randomUUID } from "node:crypto";
import { educationSelect, experienceSelect } from "../profile/profile-history.service.js";
import { ownerProfileSelect, profileView } from "../profile/profile.service.js";
import { historySchema } from "../profile/profile-history.schema.js";
import { processEvidence } from "./evidence.process.js";

export const failure = (status, message) => Object.assign(new Error(message), { status });
const conflict = () => failure(409, "This record or review changed. Reload the saved version before continuing.");
const modelFor = (kind) => kind === "education" ? "educationRecord" : "experienceRecord";
const editable = new Set(["DRAFT", "ACTION_REQUIRED", "UNABLE_TO_VERIFY"]);
const DAY = 86400000;
const evidenceSelect = { id: true, contentType: true, size: true, createdAt: true };
const attemptSelect = {
  id: true, revision: true, snapshot: true, status: true, note: true, createdAt: true, decidedAt: true,
  evidence: { select: evidenceSelect, orderBy: { createdAt: "asc" } },
};
export const reviewSelect = {
  id: true, kind: true, recordId: true, revision: true, version: true, status: true,
  initialSubmittedAt: true, submittedAt: true, reviewerId: true, note: true,
  attempts: { select: attemptSelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  events: { select: { id: true, actorId: true, action: true, revision: true, fromStatus: true, toStatus: true, note: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
};
export function reviewView(review, now = new Date(), admin = false) {
  if (!review) return null;
  const targetAt = new Date(new Date(review.initialSubmittedAt).getTime() + 7 * DAY);
  const deadlineAt = new Date(new Date(review.initialSubmittedAt).getTime() + 14 * DAY);
  const result = { ...Object.fromEntries(["id", "kind", "recordId", "revision", "version", "status", "initialSubmittedAt", "submittedAt", "reviewerId", "note"].map((key) => [key, review[key]])),
    attempts: (review.attempts ?? []).map((attempt) => ({
      ...Object.fromEntries(["id", "revision", "snapshot", "status", "note", "createdAt", "decidedAt"].map((key) => [key, attempt[key]])),
      evidence: (attempt.evidence ?? []).map((asset) => Object.fromEntries(Object.keys(evidenceSelect).map((key) => [key, asset[key]]))),
    })),
    events: (review.events ?? []).map((event) => Object.fromEntries(["id", "action", "revision", "fromStatus", "toStatus", "note", "createdAt", ...(admin ? ["actorId"] : [])].map((key) => [key, event[key]]))),
    ...(admin && review.profile ? { profile: review.profile } : {}), targetAt, deadlineAt,
    overdue: review.status !== "VERIFIED" && now >= targetAt,
    hiddenFromPublic: review.status === "FALSE_CREDENTIAL" || (review.status !== "VERIFIED" && now >= deadlineAt) };
  if (!admin) {
    delete result.reviewerId;
    result.events = result.events?.map(({ actorId, ...event }) => { void actorId; return event; });
  }
  return result;
}
// Apply this projection at read time, rather than relying on a scheduled visibility job.
// Public profile endpoints must additionally enforce their individual/profile visibility policy.
export function publicCredential(record, review, now = new Date()) {
  if (!review || review.recordId !== record.id || !["education", "experience"].includes(review.kind) || record.revision !== review.revision || record.status !== review.status ||
      record.status === "DRAFT" || record.status === "FALSE_CREDENTIAL" || reviewView(review, now).hiddenFromPublic) return null;
  const select = review.kind === "education" ? educationSelect : experienceSelect;
  return Object.fromEntries(Object.keys(select).map((key) => [key, record[key]]));
}
async function owned(tx, personId, kind, recordId) {
  const profile = await tx.profile.findUnique({ where: { personId }, select: { id: true, version: true } });
  const record = profile && await tx[modelFor(kind)].findFirst({ where: { id: recordId, profileId: profile.id } });
  if (!record) throw failure(404, "Credential record not found.");
  return { profile, record };
}
async function lockProfile(tx, profileId, expectedVersion) {
  const result = await tx.profile.updateMany({ where: { id: profileId, version: expectedVersion }, data: { version: { increment: 1 } } });
  if (result.count !== 1) throw conflict();
}
async function reviewer(tx, actorId, lock = false) {
  const where = { id: actorId, status: "ACTIVE", platformRole: "CREDENTIAL_REVIEWER", emailVerifiedAt: { not: null } };
  const ok = lock
    ? (await tx.account.updateMany({ where, data: { platformRole: "CREDENTIAL_REVIEWER" } })).count === 1
    : Boolean(await tx.account.findFirst({ where, select: { id: true } }));
  if (!ok) throw failure(403, "Reviewer access is required.");
}
async function activeOwner(tx, personId, lock = false) {
  const owner = await tx.account.findFirst({ where: { personId, status: "ACTIVE", emailVerifiedAt: { not: null } }, select: { id: true } });
  if (!owner || (lock && (await tx.account.updateMany({ where: { id: owner.id, status: "ACTIVE", emailVerifiedAt: { not: null } }, data: { status: "ACTIVE" } })).count !== 1)) throw failure(403, "An active account with a verified email is required.");
  return owner;
}
async function transaction(prisma, work) {
  try { return await prisma.$transaction(work); }
  catch (error) {
    if (["P2002", "P2034"].includes(error.code)) throw conflict();
    throw error;
  }
}
export function createCredentialService({ prisma, storage, process = processEvidence, now = () => new Date() }) {
  let uploads = 0;
  return {
    async access(actorId) { await reviewer(prisma, actorId); return { allowed: true }; },
    async ownerReviews(personId, cursor) {
      const reviews = await prisma.credentialReview.findMany({ where: { profile: { personId } },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 31,
        orderBy: [{ initialSubmittedAt: "asc" }, { id: "asc" }], select: reviewSelect });
      return { reviews: reviews.slice(0, 30).map((review) => reviewView(review, now())), nextCursor: reviews.length > 30 ? reviews[29].id : null };
    },
    async owner(personId, kind, recordId) {
      const { profile, record } = await owned(prisma, personId, kind, recordId);
      const review = await prisma.credentialReview.findUnique({ where: { kind_recordId: { kind, recordId } }, select: reviewSelect });
      return { record: Object.fromEntries(Object.keys(kind === "education" ? educationSelect : experienceSelect).map((key) => [key, record[key]])),
        profileVersion: profile.version, review: reviewView(review, now()) };
    },
    async upload(personId, kind, recordId, revision, bytes, type) {
      if (uploads >= 2) throw failure(503, "Evidence processing is busy. Please retry.");
      uploads++;
      let asset;
      try {
        await activeOwner(prisma, personId);
        const { record } = await owned(prisma, personId, kind, recordId);
        if (record.revision !== revision || !editable.has(record.status)) throw conflict();
        storage.check();
        const hour = new Date(Math.floor(now().getTime() / 3600000) * 3600000);
        await transaction(prisma, async (tx) => {
          await tx.credentialUploadBudget.upsert({ where: { personId_hour: { personId, hour } }, create: { personId, hour }, update: {} });
          const reserved = await tx.credentialUploadBudget.updateMany({ where: { personId, hour, count: { lt: 20 } }, data: { count: { increment: 1 } } });
          if (reserved.count !== 1) throw failure(429, "You have reached the hourly evidence upload limit. Try again later.");
        });
        const prepared = await process(bytes, type);
        asset = await prisma.credentialEvidence.create({ data: {
          personId, kind, recordId, revision, storageKey: `credential-evidence/${randomUUID()}`,
          contentType: prepared.contentType, size: prepared.bytes.length,
          expiresAt: new Date(now().getTime() + DAY),
        } });
        await storage.put(asset.storageKey, prepared.bytes, prepared.contentType);
        const ready = await prisma.credentialEvidence.updateMany({ where: { id: asset.id, state: "UPLOADING", expiresAt: { gt: now() } }, data: { state: "READY" } });
        if (ready.count !== 1) throw failure(409, "This upload expired. Upload the document again.");
        return { id: asset.id, contentType: asset.contentType, size: asset.size };
      } catch (error) {
        if (asset) await prisma.credentialEvidence.updateMany({ where: { id: asset.id, attemptId: null }, data: { state: "DELETE_PENDING" } });
        throw error;
      } finally { uploads--; }
    },
    async submit(personId, actorId, kind, recordId, input) {
      return transaction(prisma, async (tx) => {
        const account = await activeOwner(tx, personId, true);
        if (account.id !== actorId) throw failure(403, "Account ownership does not match.");
        const { profile, record } = await owned(tx, personId, kind, recordId);
        await lockProfile(tx, profile.id, input.expectedVersion);
        if (record.revision !== input.revision || !editable.has(record.status)) throw conflict();
        const select = kind === "education" ? educationSelect : experienceSelect;
        const snapshot = Object.fromEntries(Object.keys(select).map((key) => [key, record[key]]));
        const { status, ...validation } = snapshot;
        void status;
        if (!historySchema(kind).safeParse({ expectedVersion: input.expectedVersion, mode: "RECORDS", records: [validation] }).success) throw failure(400, "Complete and save this record before submitting it.");
        let review = await tx.credentialReview.findUnique({ where: { kind_recordId: { kind, recordId } } });
        const previousStatus = record.status;
        if (review) {
          if (!["ACTION_REQUIRED", "UNABLE_TO_VERIFY"].includes(review.status)) throw conflict();
          const changed = await tx.credentialReview.updateMany({ where: { id: review.id, version: review.version, status: review.status }, data: {
            revision: record.revision, version: { increment: 1 }, status: "SUBMITTED", submittedAt: now(), reviewerId: null, note: null,
          } });
          if (changed.count !== 1) throw conflict();
        } else {
          review = await tx.credentialReview.create({ data: { profileId: profile.id, kind, recordId, revision: record.revision, initialSubmittedAt: now(), submittedAt: now() } });
        }
        const attempt = await tx.credentialAttempt.create({ data: { reviewId: review.id, revision: record.revision, snapshot } });
        const claimed = await tx.credentialEvidence.updateMany({ where: {
          id: { in: input.evidenceIds }, personId, kind, recordId, revision: record.revision,
          state: "READY", attemptId: null, expiresAt: { gt: now() },
        }, data: { state: "ATTACHED", attemptId: attempt.id } });
        if (claimed.count !== input.evidenceIds.length) throw failure(400, "Upload fresh supporting evidence for this saved record. A document cannot be reused from another submission.");
        const updated = await tx[modelFor(kind)].updateMany({ where: { id: recordId, profileId: profile.id, revision: input.revision, status: previousStatus }, data: { status: "SUBMITTED" } });
        if (updated.count !== 1) throw conflict();
        await tx.credentialAuditEvent.create({ data: { reviewId: review.id, actorId, action: "SUBMITTED", revision: record.revision, fromStatus: previousStatus, toStatus: "SUBMITTED" } });
        return { profile: profileView(await tx.profile.findUnique({ where: { personId }, select: ownerProfileSelect })) };
      });
    },
    async queue(actorId, cursor) {
      await reviewer(prisma, actorId);
      const reviews = await prisma.credentialReview.findMany({
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 31,
        orderBy: [{ initialSubmittedAt: "asc" }, { id: "asc" }],
        select: { id: true, kind: true, recordId: true, revision: true, version: true, status: true, initialSubmittedAt: true, submittedAt: true, reviewerId: true,
          profile: { select: { person: { select: { firstName: true, lastName: true, account: { select: { username: true } } } } } } },
      });
      return { reviews: reviews.slice(0, 30).map((r) => reviewView(r, now(), true)), nextCursor: reviews.length > 30 ? reviews[29].id : null };
    },
    async detail(actorId, id) {
      await reviewer(prisma, actorId);
      const review = await prisma.credentialReview.findUnique({ where: { id }, select: { ...reviewSelect, profile: { select: { personId: true, person: { select: { account: { select: { id: true, username: true } } } } } } } });
      if (!review) throw failure(404, "Review not found.");
      if (review.profile.person.account.id === actorId) throw failure(403, "You cannot review your own credentials.");
      const { profile, ...safe } = review;
      return { review: reviewView(safe, now(), true), username: profile.person.account.username };
    },
    async transition(actorId, id, input, assign = false) {
      return transaction(prisma, async (tx) => {
        await reviewer(tx, actorId, true);
        const review = await tx.credentialReview.findUnique({ where: { id }, include: { profile: { select: { id: true, version: true, personId: true } } } });
        if (!review) throw failure(404, "Review not found.");
        const owner = await activeOwner(tx, review.profile.personId, true);
        if (owner.id === actorId) throw failure(403, "You cannot review your own credentials.");
        if (review.version !== input.expectedVersion) throw conflict();
        await lockProfile(tx, review.profileId, review.profile.version);
        const next = assign ? "IN_REVIEW" : input.status;
        if (assign ? review.status !== "SUBMITTED" : review.status !== "IN_REVIEW" || review.reviewerId !== actorId || input.revision !== review.revision) throw conflict();
        const updated = await tx[modelFor(review.kind)].updateMany({ where: { id: review.recordId, profileId: review.profileId, revision: review.revision, status: review.status }, data: { status: next } });
        if (updated.count !== 1) throw conflict();
        const changed = await tx.credentialReview.updateMany({ where: { id, version: input.expectedVersion, status: review.status }, data: { version: { increment: 1 }, status: next, reviewerId: actorId, note: assign ? null : input.note } });
        if (changed.count !== 1) throw conflict();
        const attempt = await tx.credentialAttempt.findFirst({ where: { reviewId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
        if (!attempt || attempt.revision !== review.revision || attempt.status !== review.status) throw conflict();
        await tx.credentialAttempt.update({ where: { id: attempt.id }, data: { status: next, reviewerId: actorId, note: assign ? null : input.note, decidedAt: assign ? null : now() } });
        await tx.credentialAuditEvent.create({ data: { reviewId: id, actorId, action: assign ? "ASSIGNED" : "DECIDED", revision: review.revision, fromStatus: review.status, toStatus: next, note: assign ? null : input.note } });
        return { id, status: next };
      });
    },
    async readEvidence(actorId, personId, id) {
      const asset = await prisma.credentialEvidence.findUnique({ where: { id } });
      if (!asset || asset.state !== "ATTACHED") throw failure(404, "Evidence not found.");
      if (asset.personId !== personId) {
        try { await reviewer(prisma, actorId); } catch (error) { if (error.status === 403) throw failure(404, "Evidence not found."); throw error; }
        const attempt = await prisma.credentialAttempt.findUnique({ where: { id: asset.attemptId }, select: { review: { select: { reviewerId: true } } } });
        if (attempt?.review.reviewerId !== actorId) throw failure(403, "Assign this review to yourself before downloading its evidence.");
      }
      return { bytes: await storage.get(asset.storageKey, { maxBytes: 5 * 1024 * 1024 }), contentType: asset.contentType };
    },
    async cleanup() {
      const rows = await prisma.credentialEvidence.findMany({ where: { attemptId: null, OR: [{ state: "DELETE_PENDING" }, { state: { in: ["UPLOADING", "READY"] }, expiresAt: { lte: now() } }] }, take: 100 });
      let deleted = 0;
      for (const row of rows) {
        const locked = await prisma.credentialEvidence.updateMany({ where: { id: row.id, attemptId: null, state: { in: ["UPLOADING", "READY", "DELETE_PENDING"] } }, data: { state: "DELETE_PENDING" } });
        if (locked.count !== 1) continue;
        try {
          await storage.delete(row.storageKey);
          await prisma.credentialEvidence.updateMany({ where: { id: row.id, state: "DELETE_PENDING", attemptId: null }, data: { state: "DELETED" } });
          deleted++;
        } catch { /* Retain retriable state. */ }
      }
      await prisma.credentialUploadBudget.deleteMany({ where: { hour: { lt: new Date(now().getTime() - 2 * DAY) } } });
      return { deleted };
    },
  };
}
