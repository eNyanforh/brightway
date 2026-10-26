import { z } from "zod";
import { Prisma } from "@prisma/client";
import { verifyPassword } from "../auth/password.js";
import { assertMfaSession } from "../auth/mfa.service.js";
import { createManualIdentityReviewService } from "./manual-identity-review.service.js";
import { digest, reviewPolicy, fiveWorkingDaysAfter, identityFailure as fail } from "./manual-identity.policy.js";

export const NAME_CHANGE_CONSENT = "manual-name-change-review-v1";
const DAY = 86400000, active = ["SUBMITTED", "IN_REVIEW"];
const version = z.number().int().min(0).max(2147483646);
const name = z.string().trim().min(1).max(100).refine(v => !/[\u0000-\u001f\u007f]/.test(v));
export const nameChangeSchema = z.strictObject({
  expectedProfileVersion: version.refine(v => v >= 1), expectedIdentityRevision: version,
  idempotencyKey: z.uuid(), password: z.string().min(1).max(128),
  proposedName: z.strictObject({ firstName: name, middleName: name.nullable(), lastName: name }),
  reason: z.string().trim().min(10).max(1000), governmentId: z.uuid(), selfie: z.uuid(), consentVersion: z.literal(NAME_CHANGE_CONSENT),
}).refine(v => v.governmentId !== v.selfie);
const expected = z.strictObject({ expectedVersion: version.refine(v => v >= 1) });
const decisionSchema = expected.extend({ expectedProfileVersion: version.refine(v => v >= 1), decision: z.enum(["APPROVED", "DECLINED"]), note: z.string().trim().min(10).max(2000) });
const parse = (schema, data) => { const r = schema.safeParse(data); if (!r.success) throw fail(400, "Check the name-correction fields. Unknown or incomplete fields are not allowed."); return r.data; };
const uuid = value => { if (!z.uuid().safeParse(value).success) throw fail(404, "Name-correction request not found."); return value; };
const conflict = () => fail(409, "The request or identity changed. Reload before continuing.");
const names = person => ({ firstName: person.firstName, middleName: person.middleName ?? null, lastName: person.lastName });

export function createIdentityNameChangeService({ prisma, storage, photoStorage, now = () => new Date(), policy = reviewPolicy(), verify = verifyPassword }) {
  const identities = createManualIdentityReviewService({ prisma, storage, now, policy });
  const run = async work => { try { return await prisma.$transaction(work); } catch (e) { if (["P2002", "P2034"].includes(e.code)) throw conflict(); throw e; } };
  async function lock(db, ids) {
    for (const id of [...new Set(ids)].sort()) {
      if (typeof id !== "string" || !id.trim()) throw fail(401, "Please log in to continue.");
      if ((await db.account.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "ACTIVE" } })).count !== 1) throw fail(403, "An active account is required.");
    }
  }
  async function live(db, id, sessionId) {
    if (typeof sessionId !== "string" || !sessionId.trim()) throw fail(401, "Please sign in again.");
    const session = await db.session.findUnique({ where: { id: sessionId } });
    if (!session || session.accountId !== id || session.expiresAt <= now()) throw fail(401, "Please sign in again.");
    if ((await db.mfaFactor.findUnique({ where: { accountId: id } }))?.enabled) await assertMfaSession(db, id, sessionId, now());
  }
  async function reviewer(db, id, sessionId) {
    if (typeof id !== "string" || !id.trim()) throw fail(403, "Identity-review permission is required.");
    const account = await db.account.findUnique({ where: { id }, select: { status: true, emailVerifiedAt: true } });
    if (account?.status !== "ACTIVE" || !account.emailVerifiedAt || (await db.manualIdentityReviewer.findUnique({ where: { accountId: id } }))?.enabled !== true) throw fail(403, "Identity-review permission is required.");
    await assertMfaSession(db, id, sessionId, now());
  }
  async function lockProfile(db, ctx, profileVersion) {
    if (ctx.profile.version !== profileVersion || (await db.profile.updateMany({ where: { id: ctx.profile.id, version: profileVersion }, data: { version: profileVersion } })).count !== 1) throw conflict();
    if ((await db.person.updateMany({ where: { id: ctx.account.personId }, data: { identityRevision: { increment: 0 } } })).count !== 1) throw conflict();
  }
  const event = (db, row, actorId, action, state) => db.identityNameChangeAudit.create({ data: { requestId: row.id, actorId, action, fromState: row.state, toState: state } });
  function configured() { try { policy.check(); return policy.retentionDays === 30; } catch { return false; } }
  async function projection(db, row, showPrivate) {
    const retained = !row.purgedAt && row.purgeAt > now();
    return { id: row.id, version: row.version, state: active.includes(row.state) && row.expiresAt <= now() ? "EXPIRED" : row.state,
      createdAt: row.createdAt, targetAt: row.targetAt, decidedAt: row.decidedAt, purgeAt: row.purgeAt,
      previousName: showPrivate && retained ? row.previousName : null, proposedName: showPrivate && retained ? row.proposedName : null,
      reason: showPrivate && retained ? row.reason : null, note: showPrivate && retained ? row.note : null,
      evidence: showPrivate && retained ? await db.manualIdentityEvidence.findMany({ where: { nameChangeId: row.id, state: "ATTACHED" }, select: { id: true, kind: true } }) : [] };
  }
  async function assigned(db, actorId, sessionId, id, requireAssignment = false) {
    await reviewer(db, actorId, sessionId);
    const row = await db.identityNameChange.findUnique({ where: { id: uuid(id) } });
    if (!row) throw fail(404, "Name-correction request not found.");
    if (row.accountId === actorId) throw fail(403, "You cannot review your own name correction.");
    if (requireAssignment && row.reviewerId !== actorId) throw fail(403, "Assign this request before accessing its private details.");
    return row;
  }
  return {
    async owner(id) {
      const current = await identities.inspectAccount(prisma, id);
      const rows = await prisma.identityNameChange.findMany({ where: { accountId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10 });
      const pending = await prisma.identityNameChange.findFirst({ where: { accountId: id, state: { in: active }, expiresAt: { gt: now() } } });
      return { currentName: names(current.ctx.account.person), identityRevision: current.ctx.account.person.identityRevision, profileVersion: current.ctx.profile.version,
        identityVerified: current.status === "APPROVED", canRequest: configured() && current.status === "APPROVED" && !pending,
        consentVersion: NAME_CHANGE_CONSENT, retentionDays: 30, requests: await Promise.all(rows.map(row => projection(prisma, row, true))) };
    },
    async submit(id, sessionId, body) {
      const data = parse(nameChangeSchema, body);
      if (!configured()) throw fail(503, "Configure the identity review calendar and 30-day retention before accepting name corrections.");
      const { password, ...publicInput } = data, inputHash = digest(publicInput);
      const candidate = await run(async tx => {
        await lock(tx, [id]); await live(tx, id, sessionId);
        const previous = await tx.identityNameChange.findUnique({ where: { accountId_idempotencyKey: { accountId: id, idempotencyKey: data.idempotencyKey } } });
        if (previous) { if (previous.inputHash !== inputHash) throw conflict(); return { replayed: true, id: previous.id }; }
        const attempts = await tx.manualIdentityAudit.count({ where: { targetAccountId: id, action: "NAME_CHANGE_PASSWORD_ATTEMPT", createdAt: { gte: new Date(+now() - 15 * 60000) } } });
        if (attempts >= 5) throw fail(429, "Too many password confirmations. Try again after 15 minutes.");
        await tx.manualIdentityAudit.create({ data: { targetAccountId: id, actorId: id, action: "NAME_CHANGE_PASSWORD_ATTEMPT", createdAt: now() } });
        return tx.account.findUnique({ where: { id }, select: { passwordHash: true } });
      });
      if (candidate.replayed) return candidate;
      if (!await verify(password, candidate.passwordHash)) throw fail(400, "Your current password is incorrect.");
      return run(async tx => {
        await lock(tx, [id]); await live(tx, id, sessionId);
        if ((await tx.account.findUnique({ where: { id }, select: { passwordHash: true } })).passwordHash !== candidate.passwordHash) throw fail(401, "Your password changed. Sign in again.");
        const prior = await tx.identityNameChange.findUnique({ where: { accountId_idempotencyKey: { accountId: id, idempotencyKey: data.idempotencyKey } } });
        if (prior) { if (prior.inputHash !== inputHash) throw conflict(); return { id: prior.id, replayed: true }; }
        let inspected = await identities.inspectAccount(tx, id);
        await lockProfile(tx, inspected.ctx, data.expectedProfileVersion);
        inspected = await identities.inspectAccount(tx, id);
        if (inspected.status !== "APPROVED") throw fail(403, "A currently verified identity is required for a name correction.");
        const ctx = inspected.ctx;
        if (ctx.account.person.identityRevision !== data.expectedIdentityRevision) throw conflict();
        if (digest(names(ctx.account.person)) === digest(data.proposedName)) throw fail(400, "Enter a name that differs from your current saved name.");
        const outstanding = await tx.identityNameChange.findMany({ where: { accountId: id, state: { in: active } } });
        for (const previous of outstanding) {
          if (previous.expiresAt > now()) throw conflict();
          if ((await tx.identityNameChange.updateMany({ where: { id: previous.id, version: previous.version, state: previous.state }, data: { state: "EXPIRED", version: { increment: 1 }, decidedAt: now() } })).count !== 1) throw conflict();
          await event(tx, previous, id, "EXPIRED", "EXPIRED");
        }
        if (await tx.identityNameChange.count({ where: { accountId: id, createdAt: { gte: new Date(+now() - DAY) } } }) >= 5) throw fail(429, "Name-correction request limit reached. Try again later.");
        const assets = [];
        for (const [imageId, kind] of [[data.governmentId, "GOVERNMENT_ID"], [data.selfie, "SELFIE"]]) {
          const row = await tx.manualIdentityEvidence.findFirst({ where: { id: imageId, accountId: id, kind, state: "READY", attemptId: null, nameChangeId: null, expiresAt: { gt: now() } } });
          if (!row) throw fail(400, "Upload a fresh government-issued ID and separate selfie owned by this account.");
          assets.push(row);
        }
        const row = await tx.identityNameChange.create({ data: { accountId: id, identityAttemptId: inspected.attempt.id, idempotencyKey: data.idempotencyKey, inputHash,
          baseIdentityHash: ctx.identityHash, previousName: names(ctx.account.person), proposedName: data.proposedName, reason: data.reason,
          consentVersion: data.consentVersion, targetAt: fiveWorkingDaysAfter(now(), policy.holidays), calendarVersion: policy.calendarVersion,
          expiresAt: new Date(+now() + 30 * DAY), purgeAt: new Date(+now() + 30 * DAY) } });
        for (const asset of assets) {
          if ((await tx.manualIdentityEvidence.updateMany({ where: { id: asset.id, accountId: id, state: "READY", attemptId: null, nameChangeId: null, expiresAt: { gt: now() } }, data: { state: "ATTACHED", nameChangeId: row.id } })).count !== 1) throw conflict();
        }
        await event(tx, row, id, "SUBMITTED", "SUBMITTED"); await live(tx, id, sessionId);
        return { id: row.id, replayed: false };
      });
    },
    async queue(actorId, sessionId, cursor) {
      if (cursor !== undefined) uuid(cursor);
      return run(async tx => {
        await lock(tx, [actorId]); await reviewer(tx, actorId, sessionId);
        const rows = await tx.identityNameChange.findMany({ where: { accountId: { not: actorId }, state: { in: active }, expiresAt: { gt: now() } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 21,
          select: { id: true, version: true, state: true, createdAt: true, targetAt: true } });
        return { requests: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19].id : null };
      });
    },
    async detail(actorId, sessionId, id) {
      return run(async tx => {
        await lock(tx, [actorId]); const row = await assigned(tx, actorId, sessionId, id);
        const inspected = await identities.inspectAccount(tx, row.accountId), granted = row.reviewerId === actorId;
        return { ...await projection(tx, row, granted), username: inspected.ctx.account.username, reviewerId: row.reviewerId,
          profileVersion: inspected.ctx.profile.version, stale: inspected.status !== "APPROVED" || row.baseIdentityHash !== inspected.ctx.identityHash,
          evidenceAvailable: granted && row.state === "IN_REVIEW" && !row.purgedAt && row.purgeAt > now() };
      });
    },
    async assign(actorId, sessionId, id, body) {
      const data = parse(expected, body);
      return run(async tx => {
        await lock(tx, [actorId]); const row = await assigned(tx, actorId, sessionId, id);
        if (row.state !== "SUBMITTED" || row.version !== data.expectedVersion || row.expiresAt <= now()) throw conflict();
        if ((await tx.identityNameChange.updateMany({ where: { id: row.id, version: row.version, state: "SUBMITTED" }, data: { state: "IN_REVIEW", reviewerId: actorId, version: { increment: 1 } } })).count !== 1) throw conflict();
        await event(tx, row, actorId, "ASSIGNED", "IN_REVIEW"); await reviewer(tx, actorId, sessionId); return { id: row.id };
      });
    },
    async decide(actorId, sessionId, id, body) {
      uuid(id); const data = parse(decisionSchema, body); await reviewer(prisma, actorId, sessionId);
      const known = await prisma.identityNameChange.findUnique({ where: { id } }); if (!known) throw fail(404, "Name-correction request not found.");
      return run(async tx => {
        await lock(tx, [actorId, known.accountId]); const row = await assigned(tx, actorId, sessionId, id, true);
        if (row.state !== "IN_REVIEW" || row.version !== data.expectedVersion || row.expiresAt <= now() || !row.proposedName) throw conflict();
        let inspected = await identities.inspectAccount(tx, row.accountId); await lockProfile(tx, inspected.ctx, data.expectedProfileVersion);
        inspected = await identities.inspectAccount(tx, row.accountId);
        if (inspected.status !== "APPROVED" || inspected.ctx.identityHash !== row.baseIdentityHash || inspected.attempt.id !== row.identityAttemptId) throw conflict();
        const ctx = inspected.ctx;
        if (await tx.manualIdentityEvidence.count({ where: { nameChangeId: row.id, accountId: row.accountId, state: "ATTACHED" } }) !== 2) throw conflict();
        if ((await tx.identityNameChange.updateMany({ where: { id, version: row.version, state: "IN_REVIEW", reviewerId: actorId }, data: { state: data.decision, version: { increment: 1 }, note: data.note, decidedAt: now(), purgeAt: new Date(+now() + 30 * DAY) } })).count !== 1) throw conflict();
        if (data.decision === "APPROVED") {
          if ((await tx.person.updateMany({ where: { id: ctx.account.personId, identityRevision: ctx.account.person.identityRevision }, data: row.proposedName })).count !== 1) throw conflict();
          const person = await tx.person.findUnique({ where: { id: ctx.account.personId } });
          const approvedIdentityHash = digest({ ...ctx.snapshot, ...names(person), personIdentityRevision: person.identityRevision });
          await tx.identityNameChange.updateMany({ where: { id, state: "APPROVED" }, data: { approvedIdentityHash } });
          await tx.account.updateMany({ where: { id: row.accountId }, data: { latestNameChangeId: id } });
          if ((await tx.profile.updateMany({ where: { id: ctx.profile.id, version: data.expectedProfileVersion }, data: { version: { increment: 1 } } })).count !== 1) throw conflict();
        }
        await event(tx, row, actorId, "DECIDED", data.decision); await reviewer(tx, actorId, sessionId);
        return { id, state: data.decision };
      });
    },
    async cancel(id, sessionId, requestId, body) {
      uuid(requestId); const data = parse(expected, body);
      return run(async tx => {
        await lock(tx, [id]); await live(tx, id, sessionId);
        const row = await tx.identityNameChange.findUnique({ where: { id: requestId } });
        if (!row || row.accountId !== id) throw fail(404, "Name-correction request not found.");
        if (!active.includes(row.state) || row.version !== data.expectedVersion) throw conflict();
        if ((await tx.identityNameChange.updateMany({ where: { id: requestId, version: row.version, state: row.state }, data: { state: "CANCELLED", version: { increment: 1 }, decidedAt: now(), purgeAt: new Date(+now() + 30 * DAY) } })).count !== 1) throw conflict();
        await event(tx, row, id, "CANCELLED", "CANCELLED"); return { cancelled: true };
      });
    },
    async image(actorId, sessionId, requestId, imageId) {
      uuid(requestId); uuid(imageId);
      const authorize = record => run(async tx => {
        await lock(tx, [actorId]); const row = await tx.identityNameChange.findUnique({ where: { id: requestId } });
        if (!row) throw fail(404, "Identity image not found.");
        if (row.accountId !== actorId) await assigned(tx, actorId, sessionId, requestId, true); else await live(tx, actorId, sessionId);
        if (row.purgedAt || row.purgeAt <= now()) throw fail(404, "Identity image is no longer retained.");
        if ((await tx.account.findUnique({ where: { id: row.accountId }, select: { status: true } }))?.status !== "ACTIVE") throw fail(403, "Applicant account is unavailable.");
        const asset = await tx.manualIdentityEvidence.findFirst({ where: { id: imageId, nameChangeId: row.id, accountId: row.accountId, state: "ATTACHED" } });
        if (!asset) throw fail(404, "Identity image not found.");
        if (record) { await event(tx, row, actorId, "EVIDENCE_VIEWED", row.state); if (row.accountId !== actorId) await reviewer(tx, actorId, sessionId); }
        return asset;
      });
      const asset = await authorize(false); const bytes = await storage.get(asset.storageKey, { maxBytes: 5 * 1024 * 1024 }); await authorize(true); return bytes;
    },
    async portrait(actorId, sessionId, requestId) {
      uuid(requestId);
      const authorize = record => run(async tx => {
        await lock(tx, [actorId]); const row = await assigned(tx, actorId, sessionId, requestId, true);
        if (row.state !== "IN_REVIEW" || row.purgedAt || row.purgeAt <= now()) throw conflict();
        const inspected = await identities.inspectAccount(tx, row.accountId);
        if (inspected.status !== "APPROVED" || inspected.ctx.identityHash !== row.baseIdentityHash) throw conflict();
        const photoId = inspected.ctx.profile.photo?.id;
        if (!photoId) throw fail(404, "The current approved portrait is unavailable.");
        const asset = await tx.photoAsset.findFirst({ where: { id: photoId, personId: inspected.ctx.account.personId, state: "CLAIMED" } });
        if (!asset) throw fail(404, "The current approved portrait is unavailable.");
        if (record) { await event(tx, row, actorId, "CURRENT_PORTRAIT_VIEWED", row.state); await reviewer(tx, actorId, sessionId); }
        return asset;
      });
      const asset = await authorize(false);
      if (!photoStorage) throw fail(503, "Profile photo storage is unavailable.");
      const bytes = await photoStorage.get(asset.storageKey, { maxBytes: 5 * 1024 * 1024 }); await authorize(true); return bytes;
    },
    async cleanup() {
      const rows = await prisma.identityNameChange.findMany({ where: { purgedAt: null, purgeAt: { lte: now() } }, orderBy: { purgeAt: "asc" }, take: 50 });
      let purged = 0;
      for (const row of rows) await run(async tx => {
        const locked = await tx.identityNameChange.updateMany({ where: { id: row.id, version: row.version, purgedAt: null, purgeAt: { lte: now() } }, data: { version: { increment: 1 }, purgedAt: now(), previousName: Prisma.DbNull, proposedName: Prisma.DbNull, reason: null, note: null, ...(active.includes(row.state) ? { state: "EXPIRED", decidedAt: now() } : {}) } });
        if (!locked.count) return;
        await tx.manualIdentityEvidence.updateMany({ where: { nameChangeId: row.id, state: "ATTACHED" }, data: { state: "DELETE_PENDING" } });
        await event(tx, row, "SERVER_CLEANUP", "EVIDENCE_RETENTION_ENDED", active.includes(row.state) ? "EXPIRED" : row.state); purged++;
      });
      return { purged };
    },
  };
}
