import { createManualIdentityDetailsService, missingIdentityFields } from "./manual-identity-details.service.js";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertMfaSession } from "../auth/mfa.service.js";
import { ownerProfileSelect, profileView } from "../profile/profile.service.js";
import { evaluateManualVerificationEligibility } from "../profile/manual-verification.eligibility.js";
import { IDENTITY_MAX_BYTES } from "./manual-identity.image.js";
import {
  MANUAL_REVIEW_CONSENT, submitIdentitySchema, assignIdentitySchema, decideIdentitySchema,
  identityFailure as fail, identityConflict as conflict, digest, identitySnapshot,
  reviewPolicy, fiveWorkingDaysAfter,
} from "./manual-identity.policy.js";
const DAY = 86400000;
const active = new Set(["SUBMITTED", "IN_REVIEW"]);
const evidenceSelect = { id: true, kind: true, state: true };
const ownerAccountSelect = { photoReviewRequired: true, identityRevision: true, id: true, personId: true, username: true, email: true, status: true, emailVerifiedAt: true,
  person: { select: { identityRevision: true, firstName: true, middleName: true, lastName: true, birthDate: true, gender: true } } };
function accountId(value) {
  if (typeof value !== "string" || !value.trim()) throw fail(401, "Please log in to continue.");
  return value;
}
function uuid(value) { if (!z.uuid().safeParse(value).success) throw fail(404, "Identity request not found."); return value; }
function input(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw fail(400, "Check the identity request fields. Unknown fields and incomplete inputs are not allowed.");
  return result.data;
}
export function createManualIdentityReviewService({ prisma, storage, now = () => new Date(), policy = reviewPolicy() }) {
  async function transaction(fn) {
    try { return await prisma.$transaction(fn); }
    catch (error) { if (["P2002", "P2034"].includes(error.code)) throw conflict(); throw error; }
  }
  async function lockAccounts(db, ids) {
    for (const id of [...new Set(ids.map(accountId))].sort()) {
      const locked = await db.account.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "ACTIVE" } });
      if (locked.count !== 1) throw fail(403, "An active account is required.");
    }
  }
  async function lockPerson(db, personId) {
    if (!personId || (await db.person.updateMany({ where: { id: personId }, data: { identityRevision: { increment: 0 } } })).count !== 1) throw conflict();
  }
  async function reviewer(db, actorId, sessionId) {
    accountId(actorId);
    const role = await db.manualIdentityReviewer.findUnique({ where: { accountId: actorId } });
    const account = await db.account.findUnique({ where: { id: actorId }, select: { status: true, emailVerifiedAt: true } });
    if (!role?.enabled || account?.status !== "ACTIVE" || !account.emailVerifiedAt) throw fail(403, "BrightWay identity-review permission is required.");
    await assertMfaSession(db, actorId, sessionId, now());
  }
  async function context(db, id) {
    accountId(id);
    const account = await db.account.findUnique({ where: { id }, select: ownerAccountSelect });
    if (!account || account.status !== "ACTIVE") throw fail(403, "An active account is required.");
    const row = await db.profile.findUnique({ where: { personId: account.personId }, select: ownerProfileSelect });
    const profile = profileView(row);
    const eligibility = evaluateManualVerificationEligibility(profile, profile.completion.complete);
    const snapshot = identitySnapshot(account, profile, row?.identityRevision ?? 0);
    const identityDetailsComplete = missingIdentityFields(account.person).length === 0;
    const identityHash = digest(snapshot);
    const approvedPhotoProof = account.photoReviewRequired === true && profile.photo?.id
      ? await db.profilePhotoReview.findUnique({ where: { candidatePhotoId: profile.photo.id }, select: { accountId: true, identityAttemptId: true, approvedIdentityHash: true, state: true } }) : null;
    return { account, profile, snapshot, identityHash, eligibility, identityDetailsComplete, approvedPhotoProof };
  }
  async function current(db, request) {
    if (!request) return null;
    const attempt = await db.manualIdentityAttempt.findUnique({ where: { id: request.currentAttemptId } });
    if (!attempt || attempt.requestId !== request.id) throw fail(503, "Identity request history is unavailable.");
    return attempt;
  }
  function effective(attempt, ctx) {
    if (!attempt) return "NOT_STARTED";
    if (["DECLINED", "ACTION_REQUIRED", "INVALIDATED", "EXPIRED"].includes(attempt.state)) return attempt.state;
    if (active.has(attempt.state) && attempt.expiresAt <= now()) return "EXPIRED";
    const education = ctx.profile.education.records.find((r) => r.id === attempt.educationRecordId);
    const experience = ctx.profile.experience.records.find((r) => r.id === attempt.experienceRecordId);
    const proof = ctx.approvedPhotoProof;
    const identityMatches = attempt.identityHash === ctx.identityHash || (attempt.state === "APPROVED" && proof?.state === "APPROVED" &&
      proof.accountId === ctx.account.id && proof.identityAttemptId === attempt.id && proof.approvedIdentityHash === ctx.identityHash);
    if (!ctx.eligibility.requirementsMet || !ctx.identityDetailsComplete || !identityMatches ||
        education?.status !== "VERIFIED" || education.revision !== attempt.educationRevision ||
        experience?.status !== "VERIFIED" || experience.revision !== attempt.experienceRevision) return "INVALIDATED";
    return attempt.state;
  }
  function readiness(ctx, status) {
    let submissionConfigured = true;
    try { policy.check(); } catch { submissionConfigured = false; }
    return { submissionConfigured,
      canSubmit: submissionConfigured && ctx.eligibility.requirementsMet && ctx.identityDetailsComplete && !["SUBMITTED", "IN_REVIEW", "APPROVED"].includes(status) };
  }
  async function audit(db, request, actorId, action, attempt, fromState, toState, note = null) {
    await db.manualIdentityAudit.create({ data: { requestId: request.id, targetAccountId: request.accountId, actorId,
      action, attemptId: attempt?.id ?? null, fromState, toState, note } });
  }
  async function projection(db, request, ctx, privileged = false, actorId = null) {
    const latest = await current(db, request);
    const status = effective(latest, ctx);
    const allowed = Boolean(!privileged || latest?.reviewerId === actorId);
    const history = request ? await db.manualIdentityAttempt.findMany({ where: { requestId: request.id },
      orderBy: { revision: "desc" }, take: 10 }) : [];
    const attempts = [];
    for (const attempt of history) {
      const retained = !attempt.purgedAt && attempt.purgeAt > now();
      attempts.push({ id: attempt.id, revision: attempt.revision, state: attempt.state,
        submittedAt: attempt.submittedAt, targetAt: attempt.targetAt, calendarVersion: attempt.calendarVersion, decidedAt: attempt.decidedAt, note: attempt.note,
        expiresAt: attempt.expiresAt, purgeAt: attempt.purgeAt, purgedAt: attempt.purgedAt,
        ...(privileged ? { reviewerId: attempt.reviewerId } : {}),
        snapshot: allowed && retained ? attempt.snapshot : null,
        evidence: allowed && retained ? await db.manualIdentityEvidence.findMany({ where: { attemptId: attempt.id, state: "ATTACHED" }, select: evidenceSelect }) : [],
      });
    }
    const ready = readiness(ctx, status);
    return { profileVersion: ctx.profile.version, request: request ? { id: request.id, version: request.version, revision: request.revision,
      currentAttemptId: request.currentAttemptId, initialSubmittedAt: request.initialSubmittedAt,
      targetAt: request.targetAt, overdue: active.has(status) && request.targetAt <= now(), calendarVersion: request.calendarVersion } : null,
      status, identityVerified: status === "APPROVED", eligibility: ctx.eligibility,
      identityDetailsComplete: ctx.identityDetailsComplete,
      ...(!privileged ? { missingIdentityFields: missingIdentityFields(ctx.account.person), identityDetailsRevision: ctx.account.person.identityRevision } : {}),
      ...ready,
      consentVersion: MANUAL_REVIEW_CONSENT,
      retentionDays: Number.isInteger(policy.retentionDays) ? policy.retentionDays : null,
      workingDays: "Monday–Friday, excluding configured holidays; Africa/Monrovia (UTC)",
      attempts, ...(privileged ? { username: ctx.account.username } : {}) };
  }
  async function attachedAccess(db, actorId, sessionId, id, recordDownload = false) {
    accountId(actorId); uuid(id);
    const asset = await db.manualIdentityEvidence.findUnique({ where: { id } });
    if (!asset || asset.state !== "ATTACHED" || !asset.attemptId) throw fail(404, "Identity evidence not found.");
    const attempt = await db.manualIdentityAttempt.findUnique({ where: { id: asset.attemptId } });
    if (!attempt || attempt.purgedAt || attempt.purgeAt <= now()) throw fail(404, "Identity evidence is no longer available.");
    const request = await db.manualIdentityRequest.findUnique({ where: { id: attempt.requestId } });
    if (!request || request.accountId !== asset.accountId) throw fail(404, "Identity evidence not found.");
    await lockAccounts(db, [actorId]);
    if (actorId !== asset.accountId) {
      await reviewer(db, actorId, sessionId);
      const latest = await current(db, request);
      if (latest.reviewerId !== actorId) throw fail(403, "Assign this request to yourself before downloading evidence.");
      if (recordDownload) await audit(db, request, actorId, "EVIDENCE_DOWNLOADED", attempt, attempt.state, attempt.state);
    }
    return asset;
  }
  const details = createManualIdentityDetailsService({ prisma, now });
  const service = {
    // Internal transaction-bound inspection; never exposed as an HTTP response.
    async inspectAccount(db, id) {
      const ctx = await context(db, id);
      const request = await db.manualIdentityRequest.findUnique({ where: { accountId: id } });
      const attempt = await current(db, request);
      return { ctx, request, attempt, status: effective(attempt, ctx) };
    },
    completeDetails: details.complete,
    async status(id) {
      const ctx = await context(prisma, id);
      const request = await prisma.manualIdentityRequest.findUnique({ where: { accountId: id } });
      const status = effective(await current(prisma, request), ctx);
      return { accountId: ctx.account.id, profileVersion: ctx.profile.version, status,
        identityVerified: status === "APPROVED", identityDetailsComplete: ctx.identityDetailsComplete, canSubmit: readiness(ctx, status).canSubmit };
    },
    async owner(id) {
      const ctx = await context(prisma, id);
      const request = await prisma.manualIdentityRequest.findUnique({ where: { accountId: id } });
      return projection(prisma, request, ctx);
    },
    async submit(id, supplied) {
      accountId(id); const data = input(submitIdentitySchema, supplied); policy.check();
      return transaction(async (tx) => {
        await lockAccounts(tx, [id]);
        const ctx = await context(tx, id);
        let request = await tx.manualIdentityRequest.findUnique({ where: { accountId: id } });
        const hash = digest(data);
        if (request) {
          const prior = await tx.manualIdentityAttempt.findUnique({ where: { requestId_idempotencyKey: { requestId: request.id, idempotencyKey: data.idempotencyKey } } });
          if (prior) {
            if (prior.inputHash !== hash) throw conflict();
            return { requestId: request.id, attemptId: prior.id, replayed: true };
          }
        }
        if (!ctx.eligibility.requirementsMet) throw fail(403, "Complete your profile and verify at least one education and one experience record first.");
        if (!ctx.identityDetailsComplete) throw fail(400, "Your account needs a saved name and date of birth before identity review.");
        if (ctx.profile.version !== data.expectedProfileVersion || (request?.version ?? 0) !== data.expectedVersion) throw conflict();
        const profileLock = await tx.profile.updateMany({ where: { id: ctx.profile.id, version: data.expectedProfileVersion }, data: { version: data.expectedProfileVersion } });
        if (profileLock.count !== 1) throw conflict();
        await lockPerson(tx, ctx.account.personId);
        // Reload only after holding the profile row lock; credential/photo saves use this same lock.
        const lockedContext = await context(tx, id);
        if (!lockedContext.eligibility.requirementsMet || lockedContext.identityHash !== ctx.identityHash) throw conflict();
        const previous = await current(tx, request), status = effective(previous, lockedContext);
        if (["SUBMITTED", "IN_REVIEW", "APPROVED"].includes(status)) throw fail(409, "This identity request is already active or approved.");
        const timestamp = now(), sameWindow = request && +timestamp - +request.windowStart < DAY;
        if (sameWindow && request.submissionCount >= 5) throw fail(429, "Identity request limit reached. Try again later.");
        const evidence = [];
        for (const [imageId, kind] of [[data.governmentId, "GOVERNMENT_ID"], [data.selfie, "SELFIE"]]) {
          const row = await tx.manualIdentityEvidence.findFirst({ where: { id: imageId, accountId: id, kind, state: "READY", attemptId: null, expiresAt: { gt: timestamp } } });
          if (!row) throw fail(400, "Upload a fresh government ID and a separate selfie owned by this account.");
          evidence.push(row);
        }
        const attemptId = randomUUID(), revision = (request?.revision ?? 0) + 1;
        const continueCycle = previous && (previous.state === "ACTION_REQUIRED" || (active.has(previous.state) && status === "INVALIDATED"));
        const initialSubmittedAt = continueCycle ? request.initialSubmittedAt : timestamp;
        const targetAt = continueCycle ? request.targetAt : fiveWorkingDaysAfter(timestamp, policy.holidays);
        const calendarVersion = continueCycle ? request.calendarVersion : policy.calendarVersion;
        const education = [...lockedContext.profile.education.records].filter((r) => r.status === "VERIFIED").sort((a, b) => a.id.localeCompare(b.id))[0];
        const experience = [...lockedContext.profile.experience.records].filter((r) => r.status === "VERIFIED").sort((a, b) => a.id.localeCompare(b.id))[0];
        if (previous && status !== previous.state) {
          await tx.manualIdentityAttempt.updateMany({ where: { id: previous.id, state: previous.state }, data: { state: status, decidedAt: previous.decidedAt ?? timestamp,
            purgeAt: new Date(+timestamp + previous.retentionDays * DAY) } });
          await audit(tx, request, id, "INVALIDATED_OR_EXPIRED", previous, previous.state, status);
        }
        if (!request) {
          request = await tx.manualIdentityRequest.create({ data: { accountId: id, currentAttemptId: attemptId,
            initialSubmittedAt, targetAt, calendarVersion,
            windowStart: timestamp, submissionCount: 1, version: 1, revision: 1, state: "SUBMITTED" } });
        } else {
          const changed = await tx.manualIdentityRequest.updateMany({ where: { id: request.id, version: data.expectedVersion }, data: {
            version: { increment: 1 }, revision, state: "SUBMITTED", currentAttemptId: attemptId, initialSubmittedAt, targetAt, calendarVersion,
            windowStart: sameWindow ? request.windowStart : timestamp, submissionCount: sameWindow ? request.submissionCount + 1 : 1,
          } });
          if (changed.count !== 1) throw conflict();
        }
        const attempt = await tx.manualIdentityAttempt.create({ data: { id: attemptId, requestId: request.id, revision,
          idempotencyKey: data.idempotencyKey, inputHash: hash, identityHash: lockedContext.identityHash, profileVersion: data.expectedProfileVersion,
          snapshot: lockedContext.snapshot, educationRecordId: education.id, educationRevision: education.revision,
          experienceRecordId: experience.id, experienceRevision: experience.revision, state: "SUBMITTED",
          consentVersion: data.consentVersion, consentedAt: timestamp, submittedAt: timestamp, targetAt, calendarVersion,
          expiresAt: new Date(+timestamp + 30 * DAY), purgeAt: new Date(+timestamp + 30 * DAY), retentionDays: policy.retentionDays } });
        for (const asset of evidence) {
          const changed = await tx.manualIdentityEvidence.updateMany({ where: { id: asset.id, accountId: id, kind: asset.kind, state: "READY", attemptId: null, expiresAt: { gt: timestamp } }, data: { state: "ATTACHED", attemptId } });
          if (changed.count !== 1) throw conflict();
        }
        await audit(tx, request, id, "SUBMITTED", attempt, previous?.state ?? null, "SUBMITTED");
        return { requestId: request.id, attemptId, replayed: false };
      });
    },
    async access(actorId, sessionId) {
      return transaction(async (tx) => { await lockAccounts(tx, [actorId]); await reviewer(tx, actorId, sessionId); return { allowed: true }; });
    },
    async queue(actorId, sessionId, cursor) {
      if (cursor !== undefined) uuid(cursor);
      return transaction(async (tx) => {
        await lockAccounts(tx, [actorId]); await reviewer(tx, actorId, sessionId);
        const rows = await tx.manualIdentityRequest.findMany({ where: { accountId: { not: actorId } },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), orderBy: [{ initialSubmittedAt: "asc" }, { id: "asc" }], take: 21,
          select: { id: true, version: true, revision: true, state: true, initialSubmittedAt: true, targetAt: true } });
        return { requests: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19].id : null };
      });
    },
    async detail(actorId, sessionId, id) {
      uuid(id);
      return transaction(async (tx) => {
        await lockAccounts(tx, [actorId]); await reviewer(tx, actorId, sessionId);
        const request = await tx.manualIdentityRequest.findUnique({ where: { id } });
        if (!request) throw fail(404, "Identity request not found.");
        if (request.accountId === actorId) throw fail(403, "You cannot review your own identity request.");
        return projection(tx, request, await context(tx, request.accountId), true, actorId);
      });
    },
    async transition(actorId, sessionId, id, supplied, assign = false) {
      uuid(id); const data = input(assign ? assignIdentitySchema : decideIdentitySchema, supplied);
      await reviewer(prisma, actorId, sessionId);
      const known = await prisma.manualIdentityRequest.findUnique({ where: { id }, select: { accountId: true } });
      if (!known) throw fail(404, "Identity request not found.");
      return transaction(async (tx) => {
        await lockAccounts(tx, [actorId, known.accountId]); await reviewer(tx, actorId, sessionId);
        if (actorId === known.accountId) throw fail(403, "You cannot review your own identity request.");
        const request = await tx.manualIdentityRequest.findUnique({ where: { id } });
        if (!request || request.version !== data.expectedVersion) throw conflict();
        const ctx = await context(tx, request.accountId);
        if (!ctx.profile.id) throw conflict();
        const profileLock = await tx.profile.updateMany({ where: { id: ctx.profile.id, version: ctx.profile.version }, data: { version: ctx.profile.version } });
        if (profileLock.count !== 1) throw conflict();
        await lockPerson(tx, ctx.account.personId);
        const fresh = await context(tx, request.accountId), attempt = await current(tx, request);
        if (effective(attempt, fresh) !== attempt.state) throw fail(409, "Identity details or eligibility changed, or the request expired. Ask the owner to submit fresh evidence.");
        if (assign ? attempt.state !== "SUBMITTED" : attempt.state !== "IN_REVIEW" || attempt.reviewerId !== actorId || attempt.id !== data.attemptId) throw conflict();
        const next = assign ? "IN_REVIEW" : data.status;
        const changed = await tx.manualIdentityRequest.updateMany({ where: { id, version: data.expectedVersion, currentAttemptId: attempt.id, state: attempt.state }, data: { version: { increment: 1 }, state: next } });
        if (changed.count !== 1) throw conflict();
        const saved = await tx.manualIdentityAttempt.updateMany({ where: { id: attempt.id, state: attempt.state }, data: {
          state: next, reviewerId: actorId, note: assign ? null : data.note,
          ...(assign ? {} : { decidedAt: now(), purgeAt: new Date(+now() + attempt.retentionDays * DAY) }),
        } });
        if (saved.count !== 1) throw conflict();
        if (!assign && next === "APPROVED") {
          await tx.account.updateMany({ where: { id: request.accountId, status: "ACTIVE" }, data: { photoReviewRequired: true } });
        }
        await audit(tx, request, actorId, assign ? "ASSIGNED" : "DECIDED", attempt, attempt.state, next, assign ? null : data.note);
        // Recheck at the end as well as after locking the actor; no revoked/stale MFA commit.
        await reviewer(tx, actorId, sessionId);
        return { id, status: next };
      });
    },
    async download(actorId, sessionId, id) {
      const asset = await transaction((tx) => attachedAccess(tx, actorId, sessionId, id));
      const bytes = await storage.get(asset.storageKey, { maxBytes: IDENTITY_MAX_BYTES });
      // Never hold a transaction across the storage network call. Recheck after it finishes.
      await transaction((tx) => attachedAccess(tx, actorId, sessionId, id, true));
      return { bytes, kind: asset.kind };
    },
    async cleanup() {
      const rows = await prisma.manualIdentityAttempt.findMany({ where: { purgedAt: null, purgeAt: { lte: now() } }, orderBy: { purgeAt: "asc" }, take: 50 });
      let purged = 0;
      for (const row of rows) {
        await transaction(async (tx) => {
          const request = await tx.manualIdentityRequest.findUnique({ where: { id: row.requestId } });
          if (!request) return;
          // Lock request before the attempt, as submission/decisions do.
          const locked = await tx.manualIdentityRequest.updateMany({ where: { id: request.id, version: request.version }, data: { version: request.version } });
          if (locked.count !== 1) return;
          const attempt = await tx.manualIdentityAttempt.findUnique({ where: { id: row.id } });
          if (!attempt || attempt.purgedAt || attempt.purgeAt > now()) return;
          const expired = active.has(attempt.state), next = expired ? "EXPIRED" : attempt.state;
          await tx.manualIdentityEvidence.updateMany({ where: { attemptId: row.id, state: "ATTACHED" }, data: { state: "DELETE_PENDING" } });
          await tx.manualIdentityAttempt.updateMany({ where: { id: row.id, purgedAt: null }, data: { snapshot: Prisma.DbNull, purgedAt: now(), state: next, ...(expired ? { decidedAt: now() } : {}) } });
          if (expired && request.currentAttemptId === row.id) await tx.manualIdentityRequest.updateMany({ where: { id: request.id, version: request.version }, data: { state: "EXPIRED", version: { increment: 1 } } });
          await audit(tx, request, "SERVER_CLEANUP", "EVIDENCE_RETENTION_ENDED", attempt, attempt.state, next);
          purged++;
        });
      }
      return { purged };
    },
  };
  return service;
}
