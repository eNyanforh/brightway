import { z } from "zod";
import { assertMfaSession } from "../auth/mfa.service.js";
const fail = (status, message) => Object.assign(new Error(message), { status });
const denied = () => fail(403, "BrightWay management permission, verified email and a current MFA sign-in are required.");
export const managementGrantSchema = z.strictObject({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/), action: z.enum(["grant", "revoke"]), reason: z.string().trim().min(10).max(500).refine(value => !/[\u0000-\u001f\u007f]/.test(value)) });

// Trusted server-operator operation only. There is deliberately no HTTP grant endpoint.
export function createManagementProvisioning({ prisma, now = () => new Date() }) {
  return async supplied => {
    const parsed = managementGrantSchema.safeParse(supplied);
    if (!parsed.success) throw fail(400, "Provide an existing username, grant|revoke and an operational reason of 10–500 characters.");
    const { username, action, reason } = parsed.data;
    return prisma.$transaction(async tx => {
      // Serialize membership changes, including the last-eligible-admin check. No network I/O inside this transaction.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(87708421, 1)`;
      const candidate = await tx.account.findUnique({ where: { username }, select: { id: true } });
      if (!candidate) throw fail(404, "Account not found. Register and verify the dedicated staff account first.");
      const administrators = await tx.managementAdministrator.findMany({ where: { enabled: true }, select: { accountId: true } });
      // Match existing sorted account locks; prevent MFA/status changes during eligibility checks.
      for (const id of [...new Set([candidate.id, ...administrators.map(row => row.accountId)])].sort()) {
        if ((await tx.account.updateMany({ where: { id }, data: { identityRevision: { increment: 0 } } })).count !== 1) throw fail(409, "An administrator account changed. Retry the command.");
      }
      const account = await tx.account.findUnique({ where: { id: candidate.id }, select: { id: true, username: true, status: true, emailVerifiedAt: true } });
      if (!account || account.username !== username) throw fail(409, "The account changed. Check the username and retry.");
      const factor = await tx.mfaFactor.findUnique({ where: { accountId: account.id } });
      if (action === "grant" && (account.status !== "ACTIVE" || !account.emailVerifiedAt || factor?.enabled !== true)) throw fail(403, "Register an active staff account, verify its email and enable authenticator MFA before granting management access.");
      const previous = await tx.managementAdministrator.findUnique({ where: { accountId: account.id } }), enabled = action === "grant";
      if ((previous?.enabled === true) === enabled) return { username, enabled, changed: false };
      if (!enabled) {
        const others = await tx.account.findMany({ where: { id: { in: administrators.map(row => row.accountId).filter(id => id !== account.id) }, status: "ACTIVE", emailVerifiedAt: { not: null } }, select: { id: true } });
        const factors = await tx.mfaFactor.findMany({ where: { accountId: { in: others.map(row => row.id) }, enabled: true }, select: { accountId: true } });
        if (!factors.length) throw fail(409, "Grant management access to another active, email-verified MFA account before revoking this administrator.");
      }
      const timestamp = now(), version = (previous?.version || 0) + 1;
      if (previous) {
        if ((await tx.managementAdministrator.updateMany({ where: { accountId: account.id, version: previous.version, enabled: previous.enabled }, data: { enabled, grantedAt: enabled ? timestamp : null, version } })).count !== 1) throw fail(409, "Management access changed. Retry the command.");
      } else await tx.managementAdministrator.create({ data: { accountId: account.id, enabled, grantedAt: timestamp, version } });
      await tx.managementAdministratorAudit.create({ data: { targetAccountId: account.id, actorSource: "SERVER_OPERATOR_CLI", fromEnabled: previous?.enabled === true, toEnabled: enabled, version, reason } });
      return { username, enabled, changed: true };
    });
  };
}

export function createManagementService({ prisma, now = () => new Date() }) {
  async function authorize(db, accountId, sessionId) {
    if (typeof accountId !== "string" || !accountId || typeof sessionId !== "string" || !sessionId.trim()) throw denied();
    const timestamp = now();
    const account = await db.account.findUnique({ where: { id: accountId }, select: { id: true, username: true, status: true, emailVerifiedAt: true, platformRole: true, person: { select: { firstName: true, middleName: true, lastName: true } } } });
    const role = await db.managementAdministrator.findUnique({ where: { accountId } });
    if (!account || account.status !== "ACTIVE" || !account.emailVerifiedAt || role?.enabled !== true || !role.grantedAt) throw denied();
    await assertMfaSession(db, accountId, sessionId, timestamp);
    const session = await db.session.findFirst({ where: { id: sessionId, accountId, expiresAt: { gt: timestamp } } });
    if (!session?.mfaVerifiedAt || session.mfaVerifiedAt > timestamp || session.mfaVerifiedAt < role.grantedAt) throw fail(403, "Sign out and sign in again with MFA after management access was granted.");
    return { account, role };
  }
  async function read(accountId, sessionId, full) {
    return prisma.$transaction(async tx => {
      if (typeof accountId !== "string" || !accountId || (await tx.account.updateMany({ where: { id: accountId, status: "ACTIVE" }, data: { identityRevision: { increment: 0 } } })).count !== 1) throw denied();
      const { account, role } = await authorize(tx, accountId, sessionId);
      if (!full) return { allowed: true, accountId };
      const identity = await tx.manualIdentityReviewer.findUnique({ where: { accountId } }), operator = await tx.organizationOperator.findUnique({ where: { accountId } });
      const permissions = { credentialReviewer: account.platformRole === "CREDENTIAL_REVIEWER", identityReviewer: identity?.enabled === true, organizationAgent: operator?.agentEnabled === true, organizationApprover: operator?.approverEnabled === true };
      const tools = [
        { key: "credentials", label: "Credential reviews", description: "Review claims submitted for unlisted issuers.", to: "/admin/credentials", allowed: permissions.credentialReviewer },
        { key: "identity", label: "Identity reviews", description: "Review government-issued ID and selfie submissions.", to: "/admin/manual-identity", allowed: permissions.identityReviewer },
        { key: "photos", label: "Profile photo reviews", description: "Review protected profile photo replacements.", to: "/admin/profile-photos", allowed: permissions.identityReviewer },
        { key: "names", label: "Name-correction reviews", description: "Review supported identity name corrections.", to: "/admin/name-changes", allowed: permissions.identityReviewer },
        { key: "organizations", label: "Organization verification", description: "Investigate or approve organization requests within your assigned role.", to: "/admin/organizations", allowed: permissions.organizationAgent || permissions.organizationApprover },
      ];
      const audits = await tx.managementAdministratorAudit.findMany({ where: { targetAccountId: accountId }, orderBy: [{ version: "desc" }], take: 10, select: { id: true, toEnabled: true, version: true, reason: true, createdAt: true } });
      const final = await authorize(tx, accountId, sessionId);
      if (final.role.version !== role.version) throw denied();
      return { allowed: true, accountId, username: account.username, fullName: [account.person?.firstName, account.person?.middleName, account.person?.lastName].filter(Boolean).join(" "), role: { label: "Management administrator", version: role.version, grantedAt: role.grantedAt }, permissions, tools, audits };
    });
  }
  return {
    async access(accountId, sessionId) { try { return await read(accountId, sessionId, false); } catch (error) { if ([401, 403].includes(error.status)) return { allowed: false }; throw error; } },
    context: (accountId, sessionId) => read(accountId, sessionId, true),
  };
}
