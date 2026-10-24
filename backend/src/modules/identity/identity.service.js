import { createIdentityQueue } from "./identity.queue.js";
import { createHash, randomUUID } from "node:crypto";
import { createPersonaClient, inquiryResult } from "./persona.client.js";
const fail = (status, message) => Object.assign(new Error(message), { status });
const stale = () => fail(409, "Your identity details or inquiry changed. Start again from your current profile.");
const selectOwner = { id: true, status: true, emailVerifiedAt: true, person: { select: {
  firstName: true, middleName: true, lastName: true, birthDate: true, profile: { select: { photoId: true } },
} } };
function fingerprint(account) {
  const person = account.person;
  return createHash("sha256").update(JSON.stringify([person.firstName, person.middleName ?? null,
    person.lastName, person.birthDate ? new Date(person.birthDate).toISOString().slice(0, 10) : null,
    person.profile?.photoId ?? null])).digest("hex");
}
function view(attempt, hash) {
  const changed = attempt && attempt.identityHash !== hash;
  return { environment: "sandbox", identityVerified: false, status: changed ? "stale" : attempt?.providerStatus ?? "not_started",
    sandboxApproved: Boolean(attempt && !changed && attempt.providerStatus === "approved"),
    attemptId: attempt?.id ?? null, inquiryId: changed ? null : attempt?.inquiryId ?? null };
}
export function createIdentityService({ prisma, persona = createPersonaClient(), now = () => new Date() } = {}) {
  async function owner(db, accountId) {
    if (typeof accountId !== "string" || !accountId) throw fail(401, "Please log in to continue.");
    const account = await db.account.findUnique({ where: { id: accountId }, select: selectOwner });
    if (!account || account.status !== "ACTIVE") throw fail(401, "Please log in to continue.");
    return account;
  }
  async function lock(db, accountId) {
    const result = await db.account.updateMany({ where: { id: accountId, status: "ACTIVE" }, data: { status: "ACTIVE" } });
    if (result.count !== 1) throw fail(401, "Please log in to continue.");
  }
  async function current(db, accountId) {
    const verification = await db.identityVerification.findUnique({ where: { accountId } });
    const attempt = verification?.currentAttemptId ? await db.identityInquiry.findUnique({ where: { id: verification.currentAttemptId } }) : null;
    return { verification, attempt };
  }
  async function apply(attempt, result, eventId = null) {
    return prisma.$transaction(async (tx) => {
      await lock(tx, attempt.accountId);
      if (eventId && await tx.identityWebhookReceipt.findUnique({ where: { id: eventId } })) return { duplicate: true };
      const account = await owner(tx, attempt.accountId), hash = fingerprint(account);
      const latest = await current(tx, attempt.accountId);
      if (!latest.attempt || latest.attempt.id !== attempt.id || latest.attempt.identityHash !== hash) {
        if (eventId) await tx.identityWebhookReceipt.create({ data: { id: eventId, inquiryId: result.inquiryId, outcome: "STALE" } });
        return { ignored: true };
      }
      const row = latest.attempt;
      if (row.inquiryId !== result.inquiryId) throw stale();
      // Provider timestamps order updates from concurrent refreshes and delayed webhook deliveries.
      if (!row.providerUpdatedAt || result.updatedAt > row.providerUpdatedAt) {
        await tx.identityInquiry.update({ where: { id: row.id }, data: {
          providerStatus: result.status, providerUpdatedAt: result.updatedAt, checkedAt: now(),
        } });
      }
      if (eventId) await tx.identityWebhookReceipt.create({ data: { id: eventId, inquiryId: result.inquiryId, outcome: "APPLIED" } });
      return { applied: true };
    });
  }
  return {
    async enqueueWebhook(event) {
      persona.check();
      return createIdentityQueue({ prisma, now }).enqueue(event);
    },
    async read(accountId) {
      const account = await owner(prisma, accountId), { attempt } = await current(prisma, accountId);
      return view(attempt, fingerprint(account));
    },
    async start(accountId, expectedAttemptId = null) {
      persona.check();
      const attempt = await prisma.$transaction(async (tx) => {
        await lock(tx, accountId);
        const account = await owner(tx, accountId), hash = fingerprint(account);
        if (!account.emailVerifiedAt) throw fail(403, "Verify your account email before starting identity verification.");
        const { verification, attempt: existing } = await current(tx, accountId);
        if (expectedAttemptId && existing?.id !== expectedAttemptId) throw stale();
        if (!expectedAttemptId && existing && existing.identityHash === hash && existing.templateId === persona.templateId) return existing;
        if (expectedAttemptId && existing && !["failed", "declined", "expired", "stale", "creating"].includes(existing.identityHash === hash ? existing.providerStatus : "stale")) {
          throw fail(409, "This inquiry is still active or approved. Refresh its status instead.");
        }
        const timestamp = now(), sameDay = verification && +timestamp - +verification.windowStart < 86400000;
        const count = sameDay ? verification.startCount : 0;
        if (count >= 5) throw fail(429, "You have reached today's identity inquiry limit. Try again later.");
        const attemptId = randomUUID();
        await tx.identityVerification.upsert({ where: { accountId }, create: { accountId, currentAttemptId: attemptId, windowStart: timestamp, startCount: 1 },
          update: { currentAttemptId: attemptId, windowStart: sameDay ? verification.windowStart : timestamp, startCount: count + 1 } });
        const created = await tx.identityInquiry.create({ data: { id: attemptId, accountId, identityHash: hash, templateId: persona.templateId,
          referenceId: randomUUID(), idempotencyKey: randomUUID(), createdAt: timestamp,
          createRetryUntil: new Date(+timestamp + 20 * 3600000) } });
        return created;
      });
      if (!attempt.inquiryId) {
        if (attempt.createRetryUntil <= now()) throw fail(409, "The inquiry creation retry window expired. Restart this attempt explicitly.");
        // Network work occurs outside database transactions. Retries reuse identical provider parameters and an independent random key.
        const result = await persona.create(attempt);
        await prisma.$transaction(async (tx) => {
          await lock(tx, accountId);
          const account = await owner(tx, accountId), latest = await current(tx, accountId);
          if (latest.attempt?.id !== attempt.id || fingerprint(account) !== attempt.identityHash) throw stale();
          if (latest.attempt.inquiryId && latest.attempt.inquiryId !== result.inquiryId) throw stale();
          if (!latest.attempt.inquiryId) await tx.identityInquiry.update({ where: { id: attempt.id }, data: {
            inquiryId: result.inquiryId, providerStatus: result.status, providerUpdatedAt: result.updatedAt, checkedAt: now(),
          } });
        });
      }
      return this.read(accountId);
    },
    async refresh(accountId) {
      persona.check();
      const account = await owner(prisma, accountId), { attempt } = await current(prisma, accountId);
      if (!attempt?.inquiryId) throw fail(409, "Start an identity inquiry first.");
      if (attempt.identityHash !== fingerprint(account)) throw stale();
      await apply(attempt, await persona.retrieve(attempt));
      return this.read(accountId);
    },
    async webhook(event) {
      persona.check();
      const data = event?.data, attributes = data?.attributes;
      if (data?.type !== "event" || !/^evt_[a-zA-Z0-9]+$/.test(data.id ?? "")) throw fail(400, "Invalid Persona event.");
      if (!new Set(["inquiry.created", "inquiry.started", "inquiry.completed", "inquiry.approved", "inquiry.declined", "inquiry.failed", "inquiry.expired", "inquiry.marked-for-review"]).has(attributes?.name)) return { ignored: true };
      if (await prisma.identityWebhookReceipt.findUnique({ where: { id: data.id } })) return { duplicate: true };
      const payload = attributes?.payload?.data;
      if (!/^inq_[a-zA-Z0-9]+$/.test(payload?.id ?? "")) throw fail(400, "Invalid Persona inquiry event.");
      const attempt = await prisma.identityInquiry.findUnique({ where: { inquiryId: payload.id } });
      if (!attempt) {
        // A callback may race the create response. Let Persona retry until the known attempt is bound.
        const pending = typeof payload?.attributes?.["reference-id"] === "string" ? await prisma.identityInquiry.findUnique({ where: { referenceId: payload.attributes["reference-id"] } }) : null;
        if (pending && !pending.inquiryId) throw fail(503, "Inquiry binding is pending. Retry delivery.");
        return { ignored: true };
      }
      return apply(attempt, inquiryResult(payload, attempt), data.id);
    },
  };
}
