import { z } from "zod";
import { assertMfaSession } from "../auth/mfa.service.js";
const fail = (status, message) => Object.assign(new Error(message), { status });
const denied = () => fail(403, "BrightWay management permission, verified email and a current MFA sign-in are required.");
export const managementGrantSchema = z.strictObject({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/), action: z.enum(["grant", "revoke"]), reason: z.string().trim().min(10).max(500).refine(value => !/[\u0000-\u001f\u007f]/.test(value)) });

export { createManagementProvisioning, createManagementBootstrap, createStaffProvisioning } from "./staff-provisioning.service.js";

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
      const audits = await tx.managementAdministratorAudit.findMany({ where: { targetAccountId: accountId }, orderBy: [{ version: "desc" }], take: 10, select: { id: true, toEnabled: true, toSuperAdmin: true, capability: true, capabilityEnabled: true, actorAccountId: true, version: true, reason: true, createdAt: true } });
      const final = await authorize(tx, accountId, sessionId);
      if (final.role.version !== role.version) throw denied();
      return { allowed: true, accountId, username: account.username, fullName: [account.person?.firstName, account.person?.middleName, account.person?.lastName].filter(Boolean).join(" "), role: { label: role.isSuperAdmin ? "Super Admin" : "Management staff", isSuperAdmin: role.isSuperAdmin === true, version: role.version, grantedAt: role.grantedAt }, permissions, tools, audits };
    });
  }
  return {
    async access(accountId, sessionId) { try { return await read(accountId, sessionId, false); } catch (error) { if ([401, 403].includes(error.status)) return { allowed: false }; throw error; } },
    context: (accountId, sessionId) => read(accountId, sessionId, true),
  };
}
