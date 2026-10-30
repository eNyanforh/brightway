import { z } from "zod";
import { assertMfaSession } from "../auth/mfa.service.js";

const fail = (status, message) => Object.assign(Error(message), { status });
export const staffGrantSchema = z.strictObject({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/),
  capability: z.enum(["superadmin", "credential-reviewer", "identity-reviewer", "organization-agent", "organization-approver"]),
  action: z.enum(["grant", "revoke"]),
  reason: z.string().trim().min(10).max(500).refine(value => !/[\u0000-\u001f\u007f]/.test(value)),
});

// This service is used by trusted terminal commands only; no HTTP mutation route exists.
export function createStaffProvisioning({ prisma, now = () => new Date() }) {
  return async (supplied, actor, bootstrap = false) => {
    const parsed = staffGrantSchema.safeParse(supplied);
    if (!parsed.success) throw fail(400, "Provide an existing username, a supported capability, grant|revoke and a single-line reason of 10–500 characters.");
    const { username, capability, action, reason } = parsed.data;
    if (!actor?.accountId || !actor.sessionId) throw fail(403, "Authenticate the responsible Super Admin with password and fresh MFA in the terminal.");
    if (bootstrap && (capability !== "superadmin" || action !== "grant")) throw fail(400, "Bootstrap can establish only the first Super Admin.");
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(87708421, 1)`;
      const candidate = await tx.account.findUnique({ where: { username }, select: { id: true } });
      if (!candidate) throw fail(404, "Account not found. Prepare the named, verified-email MFA account first.");
      const roots = await tx.managementAdministrator.findMany({ where: { enabled: true, isSuperAdmin: true }, select: { accountId: true } });
      for (const id of [...new Set([candidate.id, actor.accountId, ...roots.map(row => row.accountId)])].sort()) {
        if ((await tx.account.updateMany({ where: { id }, data: { identityRevision: { increment: 0 } } })).count !== 1) throw fail(409, "A staff account changed. Retry the command.");
      }
      const timestamp = now();
      const operator = await tx.account.findUnique({ where: { id: actor.accountId }, select: { id: true, status: true, emailVerifiedAt: true } });
      const operatorRole = await tx.managementAdministrator.findUnique({ where: { accountId: actor.accountId } });
      if (!operator || operator.status !== "ACTIVE" || !operator.emailVerifiedAt) throw fail(403, "An active, email-verified Super Admin is required.");
      await assertMfaSession(tx, actor.accountId, actor.sessionId, timestamp);
      const proof = await tx.session.findFirst({ where: { id: actor.sessionId, accountId: actor.accountId, expiresAt: { gt: timestamp } } });
      if (!proof?.mfaVerifiedAt || proof.mfaVerifiedAt > timestamp || +timestamp - +proof.mfaVerifiedAt > 300000) throw fail(403, "Authenticate again with a fresh MFA code before changing staff permissions.");
      if (bootstrap) {
        // Historical root grants permanently close bootstrap, even if an account is later disabled.
        if (actor.accountId !== candidate.id || roots.length || await tx.managementAdministratorAudit.findFirst({ where: { toSuperAdmin: true } })) throw fail(409, "Bootstrap is closed. An existing Super Admin must authorize subsequent staff changes.");
      } else if (operatorRole?.enabled !== true || operatorRole.isSuperAdmin !== true || !operatorRole.grantedAt || proof.mfaVerifiedAt < operatorRole.grantedAt) {
        throw fail(403, "Current Super Admin permission and MFA after its grant are required.");
      }
      const target = await tx.account.findUnique({ where: { id: candidate.id }, select: { id: true, username: true, status: true, emailVerifiedAt: true, platformRole: true } });
      if (!target || target.username !== username) throw fail(409, "The target account changed. Check its username and retry.");
      const factor = await tx.mfaFactor.findUnique({ where: { accountId: target.id } });
      const enabled = action === "grant";
      if (enabled && (target.status !== "ACTIVE" || !target.emailVerifiedAt || factor?.enabled !== true)) throw fail(403, "The target must be active, email verified and enrolled in authenticator MFA.");
      const previous = await tx.managementAdministrator.findUnique({ where: { accountId: target.id } });
      const identity = await tx.manualIdentityReviewer.findUnique({ where: { accountId: target.id } });
      const organization = await tx.organizationOperator.findUnique({ where: { accountId: target.id } });
      const current = capability === "superadmin" ? previous?.isSuperAdmin === true : capability === "credential-reviewer" ? target.platformRole === "CREDENTIAL_REVIEWER" : capability === "identity-reviewer" ? identity?.enabled === true : organization?.[capability === "organization-agent" ? "agentEnabled" : "approverEnabled"] === true;
      if (current === enabled && (!enabled || previous?.enabled === true)) return { username, capability, enabled, changed: false };
      if (capability === "superadmin" && !enabled) {
        const others = await tx.account.findMany({ where: { id: { in: roots.map(row => row.accountId).filter(id => id !== target.id) }, status: "ACTIVE", emailVerifiedAt: { not: null } }, select: { id: true } });
        if (!(await tx.mfaFactor.findMany({ where: { accountId: { in: others.map(row => row.id) }, enabled: true }, select: { accountId: true } })).length) throw fail(409, "Establish another active, verified-email MFA Super Admin before revoking this one.");
      }
      if (capability === "credential-reviewer" && current !== enabled) {
        const toRole = enabled ? "CREDENTIAL_REVIEWER" : "MEMBER";
        if ((await tx.account.updateMany({ where: { id: target.id, platformRole: target.platformRole }, data: { platformRole: toRole } })).count !== 1) throw fail(409, "Reviewer permission changed. Retry.");
        await tx.reviewerRoleAudit.create({ data: { targetAccountId: target.id, actor: actor.accountId, fromRole: target.platformRole, toRole } });
      } else if (capability === "identity-reviewer" && current !== enabled) {
        if (identity) await tx.manualIdentityReviewer.updateMany({ where: { accountId: target.id, enabled: identity.enabled }, data: { enabled } });
        else await tx.manualIdentityReviewer.create({ data: { accountId: target.id, enabled } });
        await tx.manualIdentityAudit.create({ data: { targetAccountId: target.id, actorId: actor.accountId, action: enabled ? "REVIEWER_GRANTED" : "REVIEWER_REVOKED", note: reason } });
      } else if (capability.startsWith("organization-") && current !== enabled) {
        const field = capability === "organization-agent" ? "agentEnabled" : "approverEnabled";
        if (organization) await tx.organizationOperator.updateMany({ where: { accountId: target.id }, data: { [field]: enabled } });
        else await tx.organizationOperator.create({ data: { accountId: target.id, [field]: enabled } });
        await tx.organizationOperatorAudit.create({ data: { targetAccountId: target.id, actorId: actor.accountId, capability: field === "agentEnabled" ? "agent" : "approver", enabled } });
      }
      const root = capability === "superadmin" ? enabled : previous?.isSuperAdmin === true;
      const reviewer = capability === "credential-reviewer" ? enabled : target.platformRole === "CREDENTIAL_REVIEWER";
      const identityReviewer = capability === "identity-reviewer" ? enabled : identity?.enabled === true;
      const agent = capability === "organization-agent" ? enabled : organization?.agentEnabled === true;
      const approver = capability === "organization-approver" ? enabled : organization?.approverEnabled === true;
      const portalEnabled = root || reviewer || identityReviewer || agent || approver, version = (previous?.version || 0) + 1;
      const data = { enabled: portalEnabled, isSuperAdmin: root, version, grantedAt: portalEnabled ? timestamp : null };
      if (previous) {
        if ((await tx.managementAdministrator.updateMany({ where: { accountId: target.id, version: previous.version }, data })).count !== 1) throw fail(409, "Management permission changed. Retry.");
      } else await tx.managementAdministrator.create({ data: { accountId: target.id, ...data } });
      await tx.managementAdministratorAudit.create({ data: { targetAccountId: target.id, actorAccountId: actor.accountId, actorSource: bootstrap ? "FIRST_SUPERADMIN_BOOTSTRAP" : "SUPERADMIN_TERMINAL", capability, capabilityEnabled: enabled, fromEnabled: previous?.enabled === true, toEnabled: portalEnabled, toSuperAdmin: root, version, reason } });
      return { username, capability, enabled, changed: true };
    });
  };
}

export function createManagementProvisioning(options) {
  const provision = createStaffProvisioning(options);
  return (input, actor) => { const parsed = staffGrantSchema.omit({ capability: true }).safeParse(input); if (!parsed.success) return Promise.reject(fail(400, "Invalid management grant input.")); return provision({ ...parsed.data, capability: "superadmin" }, actor); };
}
export function createManagementBootstrap(options) {
  const provision = createStaffProvisioning(options);
  return (input, actor) => provision({ ...input, capability: "superadmin", action: "grant" }, actor, true);
}
