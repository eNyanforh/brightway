import { z } from "zod";
import { verifyPassword } from "../auth/password.js";
import { assertMfaSession } from "../auth/mfa.service.js";
import { identityFailure as fail, identityConflict as conflict } from "./manual-identity.policy.js";
const fieldNames = ["firstName", "lastName", "birthDate"];
export function missingIdentityFields(person) {
  return fieldNames.filter((key) => key === "birthDate" ? !person?.birthDate : !person?.[key]?.trim());
}
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return value >= "0001-01-01" && Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value;
});
const changesSchema = z.strictObject({ firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(), birthDate: date.optional() }).refine((value) => Object.keys(value).length > 0);
const schema = z.strictObject({ expectedIdentityRevision: z.number().int().min(0).max(2147483646),
  password: z.string().min(1).max(128), changes: changesSchema });
const personSelect = { id: true, firstName: true, lastName: true, birthDate: true, identityRevision: true };
export function createManualIdentityDetailsService({ prisma, now = () => new Date(), verify = verifyPassword }) {
  async function liveSession(db, id, sessionId) {
    if (typeof sessionId !== "string") throw fail(401, "Please sign in again before saving personal details.");
    const session = await db.session.findUnique({ where: { id: sessionId } });
    if (!session || session.accountId !== id || session.expiresAt <= now()) throw fail(401, "Please sign in again before saving personal details.");
    const factor = await db.mfaFactor.findUnique({ where: { accountId: id } });
    if (factor?.enabled) await assertMfaSession(db, id, sessionId, now());
  }
  async function audit(db, id, action) {
    // Record the event, never the submitted password, names or date of birth.
    await db.manualIdentityAudit.create({ data: { targetAccountId: id, actorId: id, action, createdAt: now() } });
  }
  return {
    async complete(id, sessionId, supplied) {
      if (typeof id !== "string" || !id.trim()) throw fail(401, "Please log in to continue.");
      const parsed = schema.safeParse(supplied);
      if (!parsed.success || parsed.data.changes.birthDate > now().toISOString().slice(0, 10)) {
        throw fail(400, "Enter valid missing personal details and your current password. Date of birth cannot be in the future.");
      }
      const input = parsed.data;
      // Persist the attempt budget before expensive password work, outside the write transaction.
      const candidate = await prisma.$transaction(async (tx) => {
        const locked = await tx.account.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "ACTIVE" } });
        if (locked.count !== 1) throw fail(403, "An active account is required.");
        await liveSession(tx, id, sessionId);
        const account = await tx.account.findUnique({ where: { id }, select: { id: true, personId: true, passwordHash: true } });
        const person = await tx.person.findUnique({ where: { id: account.personId }, select: personSelect });
        const missing = missingIdentityFields(person);
        if (!person || person.identityRevision !== input.expectedIdentityRevision || !missing.length ||
            missing.some((key) => input.changes[key] === undefined) || Object.keys(input.changes).some((key) => !missing.includes(key))) {
          throw conflict();
        }
        const attempts = await tx.manualIdentityAudit.count({ where: { targetAccountId: id, action: "IDENTITY_DETAILS_PASSWORD_ATTEMPT", createdAt: { gte: new Date(+now() - 15 * 60000) } } });
        if (attempts >= 5) throw fail(429, "Too many password confirmations. Try again after 15 minutes.");
        await audit(tx, id, "IDENTITY_DETAILS_PASSWORD_ATTEMPT");
        return account;
      });
      if (!await verify(input.password, candidate.passwordHash)) throw fail(400, "Your current password is incorrect.");
      return prisma.$transaction(async (tx) => {
        const locked = await tx.account.updateMany({ where: { id, status: "ACTIVE", passwordHash: candidate.passwordHash }, data: { status: "ACTIVE" } });
        if (locked.count !== 1) throw fail(401, "Your account or password changed. Sign in again before continuing.");
        await liveSession(tx, id, sessionId);
        const person = await tx.person.findUnique({ where: { id: candidate.personId }, select: personSelect });
        const missing = missingIdentityFields(person);
        if (!person || person.identityRevision !== input.expectedIdentityRevision || !missing.length ||
            missing.some((key) => input.changes[key] === undefined) || Object.keys(input.changes).some((key) => !missing.includes(key))) throw conflict();
        const data = { ...input.changes };
        if (data.birthDate) data.birthDate = new Date(`${data.birthDate}T00:00:00.000Z`);
        const updated = await tx.person.updateMany({ where: { id: person.id, identityRevision: input.expectedIdentityRevision,
          ...Object.fromEntries(Object.keys(data).map((key) => [key, person[key]])) }, data });
        if (updated.count !== 1) throw conflict();
        await audit(tx, id, "MISSING_IDENTITY_DETAILS_COMPLETED");
        await liveSession(tx, id, sessionId);
        return { saved: true };
      });
    },
  };
}
