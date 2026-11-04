import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertManagementSession, capabilities, lockReviewActors } from "./management-authority.js";
const fail = (status, message) => Object.assign(Error(message), { status });
export const newStaffSchema = z.strictObject({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/), fullName: z.string().trim().min(2).max(160), email: z.email().max(254).transform(value => value.trim().toLowerCase()), passwordHash: z.string().regex(/^scrypt\$/), reason: z.string().trim().min(10).max(500) });
export function createManagementProvisioner({ prisma, now = () => new Date() }) {
  async function root(tx, actor) {
    if (!actor?.staffId || !actor.sessionId) throw fail(403, "Authenticate the responsible management Super Admin.");
    const staff = await assertManagementSession(tx, actor.staffId, actor.sessionId, now(), true);
    if (!staff.isSuperAdmin) throw fail(403, "Super Admin authority is required.");
    return staff;
  }
  const serial = work => prisma.$transaction(async tx => { await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(87708421, 2)`; return work(tx); });
  const event = (tx, actorId, targetStaffId, action, reason, data) => tx.managementStaffAudit.create({ data: { actorId, targetStaffId, action, reason, ...(data ? { data } : {}) } });
  return {
    async create(input, actor = null, bootstrap = false) {
      const parsed = newStaffSchema.safeParse(input); if (!parsed.success) throw fail(400, "Provide a valid new management username, full name, email, password and reason.");
      return serial(async tx => {
        if (!bootstrap) await lockReviewActors(tx, [actor?.staffId]);
        const operator = bootstrap ? null : await root(tx, actor);
        if (bootstrap && (await tx.managementStaff.findFirst({ where: { isSuperAdmin: true } }) || await tx.managementStaffAudit.findFirst({ where: { action: "ROOT_BOOTSTRAPPED" } }))) throw fail(409, "Management bootstrap is permanently closed. Use an existing Super Admin.");
        if (await tx.managementStaff.findFirst({ where: { OR: [{ username: parsed.data.username }, { email: parsed.data.email }] } })) throw fail(409, "That management username or email already exists.");
        const { reason, ...fields } = parsed.data, id = `mg_${randomUUID()}`;
        const staff = await tx.managementStaff.create({ data: { ...fields, id, isSuperAdmin: bootstrap, capabilities: [], recoveryHashes: [], status: "PENDING" } });
        await event(tx, operator?.id || id, id, bootstrap ? "ROOT_BOOTSTRAPPED" : "STAFF_CREATED", reason);
        if (operator) await root(tx, actor);
        return { id: staff.id, username: staff.username, status: "PENDING" };
      });
    },
    async change({ username, capability, enabled, reason }, actor) {
      if (!/^[a-z0-9_]{3,30}$/.test(username || "") || !["superadmin", "access", ...capabilities].includes(capability) || typeof enabled !== "boolean" || typeof reason !== "string" || reason.trim().length < 10 || reason.length > 500) throw fail(400, "Invalid management permission change.");
      return serial(async tx => {
        const target = await tx.managementStaff.findUnique({ where: { username } }); if (!target) throw fail(404, "Management staff not found.");
        // Same sorted actor order as review decisions and explicit revocation.
        await lockReviewActors(tx, [...new Set([actor.staffId, ...(target.status === "ACTIVE" ? [target.id] : [])])]);
        const operator = await root(tx, actor);
        const current = await tx.managementStaff.findUnique({ where: { id: target.id } });
        if (capability === "access" && enabled) throw fail(400, "Disabled management staff require a separate reviewed recovery; access cannot bypass enrollment.");
        const removesRoot = current.isSuperAdmin && ((capability === "superadmin" || capability === "access") && !enabled);
        if (removesRoot && !await tx.managementStaff.findFirst({ where: { id: { not: target.id }, status: "ACTIVE", isSuperAdmin: true, emailVerifiedAt: { not: null }, encryptedSecret: { not: null } } })) throw fail(409, "Establish another active MFA Super Admin before removing this root.");
        const values = new Set(current.capabilities); if (enabled) values.add(capability); else values.delete(capability);
        const changed = await tx.managementStaff.updateMany({ where: { id: current.id, version: current.version }, data: { version: { increment: 1 }, ...(capability === "superadmin" ? { isSuperAdmin: enabled } : capability === "access" ? { status: "DISABLED" } : { capabilities: [...values] }) } });
        if (changed.count !== 1) throw fail(409, "Management staff changed. Reload before provisioning permissions.");
        await tx.managementSession.deleteMany({ where: { staffId: target.id } });
        await tx.managementChallenge.updateMany({ where: { staffId: target.id }, data: { consumedAt: now(), setupSecret: null, emailCodeHash: null } });
        await event(tx, operator.id, target.id, "PERMISSION_CHANGED", reason.trim(), { capability, enabled, previousVersion: current.version });
        return { username, capability, enabled };
      });
    },
  };
}
