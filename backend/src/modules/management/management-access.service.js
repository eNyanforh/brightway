import { assertManagementSession, lockReviewActors, permits } from "./management-authority.js";
import { readPlatformStatistics } from "./management-statistics.js";
const fail = () => Object.assign(Error("Current BrightWay management access is required."), { status: 403 });
export function createManagementService({ prisma, now = () => new Date(), readStatistics = readPlatformStatistics }) {
  async function checked(tx, id, sessionId) {
    await lockReviewActors(tx, [id]);
    return assertManagementSession(tx, id, sessionId, now());
  }
  return {
    async access(id, sessionId) {
      try { await assertManagementSession(prisma, id, sessionId, now()); return { allowed: true, staffId: id }; }
      catch (error) { if ([401, 403].includes(error.status)) return { allowed: false }; throw error; }
    },
    async context(id, sessionId) {
      return prisma.$transaction(async tx => {
        const staff = await checked(tx, id, sessionId);
        const tools = [
          ["credentials", "Credential reviews", "Review claims from unlisted issuers.", "/admin/credentials", "credential-reviewer"],
          ["identity", "Identity reviews", "Review government-issued ID and selfie submissions.", "/admin/manual-identity", "identity-reviewer"],
          ["photos", "Profile photo reviews", "Review protected profile photo replacements.", "/admin/profile-photos", "identity-reviewer"],
          ["names", "Name-correction reviews", "Review supported identity name corrections.", "/admin/name-changes", "identity-reviewer"],
          ["organizations", "Organization verification", "Investigate or approve within the separation-of-duties rules.", "/admin/organizations", "organization-agent"],
        ].map(([key, label, description, to, permission]) => ({ key, label, description, to, allowed: permits(staff, permission) || key === "organizations" && permits(staff, "organization-approver") }));
        const audits = await tx.managementStaffAudit.findMany({ where: { targetStaffId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10, select: { id: true, actorId: true, action: true, reason: true, createdAt: true } });
        const final = await assertManagementSession(tx, id, sessionId, now()); if (staff.version !== final.version) throw fail();
        return { allowed: true, staffId: id, username: staff.username, fullName: staff.fullName, role: { label: staff.isSuperAdmin ? "Super Admin" : "Management staff", isSuperAdmin: staff.isSuperAdmin, version: staff.version, grantedAt: staff.createdAt }, tools, audits };
      });
    },
    async statistics(id, sessionId) {
      return prisma.$transaction(async tx => {
        const staff = await checked(tx, id, sessionId); if (!staff.isSuperAdmin) throw fail();
        const snapshot = await readStatistics(tx, now());
        const final = await assertManagementSession(tx, id, sessionId, now()); if (!final.isSuperAdmin || staff.version !== final.version) throw fail();
        return { ...snapshot, staffId: id };
      });
    },
  };
}
