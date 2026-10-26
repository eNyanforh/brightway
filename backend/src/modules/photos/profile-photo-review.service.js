import { digest } from "../manual-identity/manual-identity.policy.js";
import { z } from "zod";
import { assertMfaSession } from "../auth/mfa.service.js";
import { createManualIdentityReviewService } from "../manual-identity/manual-identity-review.service.js";
import { activePhotoReview, photoReviewView, photoReviewSelect, photoReviewVersionSchema, photoReviewDecisionSchema, photoReviewCancelSchema } from "./profile-photo.policy.js";

const failure = (status, message) => Object.assign(new Error(message), { status });
const conflict = () => failure(409, "The photo request or profile changed. Reload before continuing.");
const uuid = (id) => { if (!z.uuid().safeParse(id).success) throw failure(404, "Photo request not found."); return id; };
const parse = (schema, body) => { const r = schema.safeParse(body); if (!r.success) throw failure(400, "Check the photo review fields. Unknown fields are not allowed."); return r.data; };

export function createProfilePhotoReviewService({ prisma, storage, now = () => new Date() }) {
  const identities = createManualIdentityReviewService({ prisma, storage: null, now });
  const txRun = async (work) => {
    try { return await prisma.$transaction(work); }
    catch (error) { if (["P2002", "P2034"].includes(error.code)) throw conflict(); throw error; }
  };
  async function lockAccounts(tx, ids) {
    for (const id of [...new Set(ids)].sort()) {
      if (!id || (await tx.account.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "ACTIVE" } })).count !== 1) throw failure(403, "An active account is required.");
    }
  }
  async function reviewer(tx, actorId, sessionId) {
    if (typeof actorId !== "string" || !actorId) throw failure(403, "BrightWay identity-review permission is required.");
    const account = await tx.account.findUnique({ where: { id: actorId }, select: { status: true, emailVerifiedAt: true } });
    const role = await tx.manualIdentityReviewer.findUnique({ where: { accountId: actorId } });
    if (account?.status !== "ACTIVE" || !account.emailVerifiedAt || role?.enabled !== true) throw failure(403, "BrightWay identity-review permission is required.");
    await assertMfaSession(tx, actorId, sessionId, now());
  }
  async function lockProfile(tx, personId, version) {
    const row = await tx.profile.findUnique({ where: { personId } });
    if (!row || row.version !== version || (await tx.profile.updateMany({ where: { personId, version }, data: { version } })).count !== 1) throw conflict();
    if ((await tx.person.updateMany({ where: { id: personId }, data: { identityRevision: { increment: 0 } } })).count !== 1) throw conflict();
    return row;
  }
  const event = (tx, row, actorId, action, state, note = null) => tx.profilePhotoReviewAudit.create({ data: {
    reviewId: row.id, actorId, action, fromState: row.state, toState: state, note,
  } });
  async function summary(tx, profileId, required) {
    const profile = await tx.profile.findUnique({ where: { id: profileId }, select: { latestPhotoReview: { select: photoReviewSelect } } });
    return photoReviewView(profile?.latestPhotoReview ? [profile.latestPhotoReview] : [], required);
  }
  async function ownedAsset(tx, id, personId) {
    const row = await tx.photoAsset.findFirst({ where: { id, personId, state: "CLAIMED" } });
    if (!row) throw failure(404, "Profile image is no longer available.");
    return row;
  }
  async function readReview(tx, actorId, sessionId, id, needAssigned = false) {
    await reviewer(tx, actorId, sessionId);
    const row = await tx.profilePhotoReview.findUnique({ where: { id: uuid(id) } });
    if (!row) throw failure(404, "Photo request not found.");
    if (row.accountId === actorId) throw failure(403, "You cannot review your own photo.");
    if (needAssigned) {
      if (row.reviewerId !== actorId) throw failure(403, "Assign this photo request to yourself before viewing its images.");
      if (row.state !== "IN_REVIEW") throw conflict();
    }
    return row;
  }

  return {
    // Called only inside the photo upload transaction, after private storage succeeds.
    async applyReplacement(tx, personId, expectedVersion, asset) {
      const candidate = await tx.account.findUnique({ where: { personId }, select: { id: true } });
      if (!candidate) throw failure(403, "An active account is required.");
      await lockAccounts(tx, [candidate.id]);
      // Identity approval takes the same account lock. Read the gate only after
      // acquiring it so an upload waiting on approval cannot publish directly
      // using a pre-approval snapshot under PostgreSQL READ COMMITTED.
      const account = await tx.account.findUnique({ where: { id: candidate.id }, select: { id: true, personId: true, status: true, photoReviewRequired: true } });
      if (!account || account.status !== "ACTIVE" || account.personId !== personId) throw failure(403, "An active account is required.");
      let profile = await tx.profile.findUnique({ where: { personId } });
      if (!profile) {
        if (expectedVersion !== 0 || account.photoReviewRequired) throw conflict();
      } else profile = await lockProfile(tx, personId, expectedVersion);
      const claimed = await tx.photoAsset.updateMany({ where: { id: asset.id, personId, state: "READY", expiresAt: { gt: now() } }, data: { state: "CLAIMED" } });
      if (claimed.count !== 1) throw conflict();
      if (account.photoReviewRequired !== true) {
        if (!profile) await tx.profile.create({ data: { personId, photoId: asset.id, version: 1 } });
        else {
          if ((await tx.profile.updateMany({ where: { personId, version: expectedVersion }, data: { photoId: asset.id, version: { increment: 1 } } })).count !== 1) throw conflict();
          if (profile.photoId) await tx.photoAsset.updateMany({ where: { id: profile.photoId, personId }, data: { state: "DELETE_PENDING" } });
        }
        return { photoAssetId: asset.id, profileVersion: expectedVersion + 1, reviewRequired: false, photoReview: photoReviewView() };
      }
      const before = await identities.inspectAccount(tx, account.id);
      const previous = await tx.profilePhotoReview.findMany({ where: { accountId: account.id, state: { in: activePhotoReview } } });
      for (const row of previous) {
        if ((await tx.profilePhotoReview.updateMany({ where: { id: row.id, version: row.version, state: row.state }, data: { state: "SUPERSEDED", version: { increment: 1 }, decidedAt: now() } })).count !== 1) throw conflict();
        await tx.photoAsset.updateMany({ where: { id: row.candidatePhotoId, personId, state: "CLAIMED" }, data: { state: "DELETE_PENDING" } });
        await event(tx, row, account.id, "SUPERSEDED", "SUPERSEDED");
      }
      const row = await tx.profilePhotoReview.create({ data: {
        accountId: account.id, profileId: profile.id, candidatePhotoId: asset.id, previousPhotoId: profile.photoId,
        identityAttemptId: before.status === "APPROVED" ? before.attempt.id : null, baseIdentityHash: before.ctx.identityHash,
      } });
      if ((await tx.profile.updateMany({ where: { personId, version: expectedVersion }, data: { version: { increment: 1 }, latestPhotoReviewId: row.id } })).count !== 1) throw conflict();
      await event(tx, row, account.id, "SUBMITTED", "PENDING");
      return { photoAssetId: profile.photoId, uploadedPhotoAssetId: asset.id, profileVersion: expectedVersion + 1, reviewRequired: true, photoReview: await summary(tx, profile.id, true) };
    },
    async queue(actorId, sessionId, cursor) {
      if (cursor !== undefined) uuid(cursor);
      return txRun(async (tx) => {
        await lockAccounts(tx, [actorId]); await reviewer(tx, actorId, sessionId);
        const rows = await tx.profilePhotoReview.findMany({ where: { accountId: { not: actorId }, state: { in: activePhotoReview } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 21,
          select: { id: true, version: true, state: true, createdAt: true } });
        return { requests: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19].id : null };
      });
    },
    async detail(actorId, sessionId, id) {
      return txRun(async (tx) => {
        await lockAccounts(tx, [actorId]); const row = await readReview(tx, actorId, sessionId, id);
        const account = await tx.account.findUnique({ where: { id: row.accountId }, select: { username: true } });
        const context = await identities.inspectAccount(tx, row.accountId);
        return { id: row.id, version: row.version, state: row.state, username: account.username, reviewerId: row.reviewerId,
          profileVersion: context.ctx.profile.version, submittedAt: row.createdAt, note: row.note,
          stale: context.ctx.identityHash !== row.baseIdentityHash || context.ctx.profile.photo?.id !== row.previousPhotoId,
          imagesAvailable: row.state === "IN_REVIEW" && row.reviewerId === actorId };
      });
    },
    async assign(actorId, sessionId, id, body) {
      const input = parse(photoReviewVersionSchema, body);
      return txRun(async (tx) => {
        await lockAccounts(tx, [actorId]); const row = await readReview(tx, actorId, sessionId, id);
        if (row.state !== "PENDING" || row.version !== input.expectedVersion) throw conflict();
        if ((await tx.profilePhotoReview.updateMany({ where: { id: row.id, version: row.version, state: "PENDING" }, data: { state: "IN_REVIEW", reviewerId: actorId, version: { increment: 1 } } })).count !== 1) throw conflict();
        await event(tx, row, actorId, "ASSIGNED", "IN_REVIEW"); await reviewer(tx, actorId, sessionId);
        return { id: row.id, state: "IN_REVIEW" };
      });
    },
    async decide(actorId, sessionId, id, body) {
      uuid(id); const input = parse(photoReviewDecisionSchema, body);
      await reviewer(prisma, actorId, sessionId);
      const known = await prisma.profilePhotoReview.findUnique({ where: { id } });
      if (!known) throw failure(404, "Photo request not found.");
      return txRun(async (tx) => {
        await lockAccounts(tx, [actorId, known.accountId]); const row = await readReview(tx, actorId, sessionId, id, true);
        if (row.version !== input.expectedVersion) throw conflict();
        const owner = await tx.account.findUnique({ where: { id: row.accountId }, select: { personId: true } });
        const profile = await lockProfile(tx, owner.personId, input.expectedProfileVersion);
        const before = await identities.inspectAccount(tx, row.accountId);
        if (before.ctx.identityHash !== row.baseIdentityHash || profile.photoId !== row.previousPhotoId) throw conflict();
        await ownedAsset(tx, row.candidatePhotoId, owner.personId);
        if ((await tx.profilePhotoReview.updateMany({ where: { id, version: row.version, state: "IN_REVIEW", reviewerId: actorId }, data: {
          state: input.decision, version: { increment: 1 }, note: input.note, decidedAt: now(),
        } })).count !== 1) throw conflict();
        if (input.decision === "APPROVED") {
          if ((await tx.profile.updateMany({ where: { id: profile.id, version: input.expectedProfileVersion }, data: { photoId: row.candidatePhotoId, version: { increment: 1 } } })).count !== 1) throw conflict();
          if (before.status === "APPROVED") {
            // Account, Person and Profile are locked. Read the trigger-produced photo
            // revision without repeating all profile/credential relation queries.
            const published = await tx.profile.findUnique({ where: { id: profile.id }, select: { photoId: true, identityRevision: true } });
            const approvedIdentityHash = digest({ ...before.ctx.snapshot, profileIdentityRevision: published.identityRevision, profilePhotoId: published.photoId });
            await tx.profilePhotoReview.updateMany({ where: { id, state: "APPROVED" }, data: { identityAttemptId: before.attempt.id, approvedIdentityHash } });
          }
          if (profile.photoId) await tx.photoAsset.updateMany({ where: { id: profile.photoId, personId: owner.personId }, data: { state: "DELETE_PENDING" } });
        } else {
          await tx.photoAsset.updateMany({ where: { id: row.candidatePhotoId, personId: owner.personId, state: "CLAIMED" }, data: { state: "DELETE_PENDING" } });
          if ((await tx.profile.updateMany({ where: { id: profile.id, version: input.expectedProfileVersion }, data: { version: { increment: 1 } } })).count !== 1) throw conflict();
        }
        await event(tx, row, actorId, "DECIDED", input.decision, input.note);
        await reviewer(tx, actorId, sessionId);
        return { id, state: input.decision };
      });
    },
    async cancel(accountId, id, body) {
      uuid(id); const input = parse(photoReviewCancelSchema, body);
      return txRun(async (tx) => {
        await lockAccounts(tx, [accountId]);
        const row = await tx.profilePhotoReview.findUnique({ where: { id } });
        if (!row || row.accountId !== accountId) throw failure(404, "Photo request not found.");
        if (!activePhotoReview.includes(row.state) || row.version !== input.expectedVersion) throw conflict();
        const owner = await tx.account.findUnique({ where: { id: accountId }, select: { personId: true, photoReviewRequired: true } });
        const profile = await lockProfile(tx, owner.personId, input.expectedProfileVersion);
        if ((await tx.profilePhotoReview.updateMany({ where: { id, version: row.version, state: row.state }, data: { state: "CANCELLED", version: { increment: 1 }, decidedAt: now() } })).count !== 1) throw conflict();
        await tx.photoAsset.updateMany({ where: { id: row.candidatePhotoId, personId: owner.personId, state: "CLAIMED" }, data: { state: "DELETE_PENDING" } });
        if ((await tx.profile.updateMany({ where: { id: profile.id, version: input.expectedProfileVersion }, data: { version: { increment: 1 } } })).count !== 1) throw conflict();
        await event(tx, row, accountId, "CANCELLED", "CANCELLED");
        return { profileVersion: profile.version + 1, photoAssetId: profile.photoId, photoReview: await summary(tx, profile.id, owner.photoReviewRequired) };
      });
    },
    async image(actorId, sessionId, id, which) {
      if (!["current", "candidate"].includes(which)) throw failure(404, "Profile image not found.");
      const authorize = (record = false) => txRun(async (tx) => {
        await lockAccounts(tx, [actorId]); const row = await readReview(tx, actorId, sessionId, id, true);
        const owner = await tx.account.findUnique({ where: { id: row.accountId }, select: { personId: true, status: true } });
        if (owner?.status !== "ACTIVE") throw failure(403, "The applicant account is unavailable.");
        const asset = await ownedAsset(tx, which === "current" ? row.previousPhotoId : row.candidatePhotoId, owner.personId);
        if (record) { await event(tx, row, actorId, "IMAGE_VIEWED", row.state, which); await reviewer(tx, actorId, sessionId); }
        return asset;
      });
      const asset = await authorize();
      const bytes = await storage.get(asset.storageKey, { maxBytes: 5 * 1024 * 1024 });
      await authorize(true);
      return bytes;
    },
  };
}
