import { z } from "zod";
import { assertManagementSession, staffId, lockReviewActors } from "./management-authority.js";
const fail = (status, message) => Object.assign(Error(message), { status });
export function createManagementTransition({ prisma, now = () => new Date() }) {
  async function root(db, actor) {
    const staff = await assertManagementSession(db, actor.staffId, actor.sessionId, now(), true);
    if (!staff.isSuperAdmin) throw fail(403, "Super Admin authority is required for legacy transition.");
  }
  const audit = (tx, actor, targetId, action, data, reason) => tx.managementStaffAudit.create({ data: { actorId: actor.staffId, targetStaffId: actor.staffId, action, reason, data: { targetId, ...data } } });
  return {
    async inventory(actor) {
      await root(prisma, actor);
      const grants = {
        credentialReviewers: await prisma.account.count({ where: { platformRole: "CREDENTIAL_REVIEWER" } }),
        identityReviewers: await prisma.manualIdentityReviewer.count({ where: { enabled: true } }),
        organizationOperators: await prisma.organizationOperator.count({ where: { OR: [{ agentEnabled: true }, { approverEnabled: true }] } }),
      };
      const legacy = { not: null, notIn: (await prisma.managementStaff.findMany({ select: { id: true } })).map(row => row.id) };
      const pending = {
        credentials: await prisma.credentialReview.findMany({ where: { issuerOrganizationId: null, status: "IN_REVIEW", reviewerId: legacy }, take: 200, orderBy: { id: "asc" }, select: { id: true, version: true } }),
        identities: await prisma.manualIdentityAttempt.findMany({ where: { state: "IN_REVIEW", reviewerId: legacy }, take: 200, orderBy: { id: "asc" }, select: { id: true, requestId: true, request: { select: { version: true, currentAttemptId: true } } } }),
        photos: await prisma.profilePhotoReview.findMany({ where: { state: "IN_REVIEW", reviewerId: legacy }, take: 200, orderBy: { id: "asc" }, select: { id: true, version: true } }),
        names: await prisma.identityNameChange.findMany({ where: { state: "IN_REVIEW", reviewerId: legacy }, take: 200, orderBy: { id: "asc" }, select: { id: true, version: true } }),
        organizations: await prisma.organizationRequest.findMany({ where: { status: { in: ["ASSIGNED", "RECOMMENDED"] }, assignedAgentId: legacy }, take: 200, orderBy: { id: "asc" }, select: { id: true, version: true } }),
      };
      await root(prisma, actor); return { pageLimit: 200, legacyGrants: grants, pending, note: "Legacy grants are no longer accepted by management APIs. Final decisions and historic actors remain unchanged. Organization requests require a fresh management Agent investigation." };
    },
    async release(actor, kind, id, expectedVersion, reason) {
      if (!["credentials", "identities", "photos", "names"].includes(kind) || !z.uuid().safeParse(id).success || !Number.isInteger(expectedVersion) || expectedVersion < 1 || typeof reason !== "string" || reason.trim().length < 10 || reason.length > 500) throw fail(400, "Provide a supported review kind, request UUID, current version and reason.");
      await root(prisma, actor);
      const modelName = { credentials: "credentialReview", identities: "manualIdentityRequest", photos: "profilePhotoReview", names: "identityNameChange" }[kind];
      const candidate = await prisma[modelName].findUnique({ where: { id } });
      if (!candidate) throw fail(404, "Legacy review not found.");
      const profile = kind === "credentials" ? await prisma.profile.findUnique({ where: { id: candidate.profileId }, select: { personId: true } }) : null;
      const owner = kind === "credentials" ? profile && await prisma.account.findUnique({ where: { personId: profile.personId }, select: { id: true } }) : { id: candidate.accountId };
      if (!owner?.id) throw fail(409, "Applicant unavailable.");
      return prisma.$transaction(async tx => {
        await lockReviewActors(tx, [owner.id, actor.staffId]); await root(tx, actor);
        const model = { credentials: "credentialReview", identities: "manualIdentityRequest", photos: "profilePhotoReview", names: "identityNameChange" }[kind];
        const row = await tx[model].findUnique({ where: { id } });
        if (!row || row.version !== expectedVersion || (row.status || row.state) !== "IN_REVIEW") throw fail(409, "The legacy assignment changed. Reload its current version.");
        const attempt = kind === "identities" ? await tx.manualIdentityAttempt.findUnique({ where: { id: row.currentAttemptId } }) : null;
        const previous = attempt?.reviewerId || row.reviewerId;
        if (!previous || staffId(previous) || kind === "credentials" && row.issuerOrganizationId) throw fail(409, "Only an unfinished legacy BrightWay assignment can be released.");
        const version = row.version + 1;
        if (kind === "credentials") {
          const profile = await tx.profile.findUnique({ where: { id: row.profileId } });
          const owner = await tx.account.findUnique({ where: { personId: profile.personId }, select: { id: true } });
          // Owner and management actor locks precede the profile/review version checks.
          if (!owner) throw fail(409, "Applicant unavailable.");
          if ((await tx.profile.updateMany({ where: { id: profile.id, version: profile.version }, data: { version: { increment: 1 } } })).count !== 1) throw fail(409, "Profile changed.");
          const recordModel = row.kind === "education" ? "educationRecord" : "experienceRecord";
          if ((await tx[recordModel].updateMany({ where: { id: row.recordId, revision: row.revision, status: "IN_REVIEW" }, data: { status: "SUBMITTED" } })).count !== 1) throw fail(409, "Claim changed.");
          const latest = await tx.credentialAttempt.findFirst({ where: { reviewId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
          if (!latest || latest.status !== "IN_REVIEW" || latest.reviewerId !== previous) throw fail(409, "Submission changed.");
          await tx.credentialAttempt.updateMany({ where: { id: latest.id }, data: { status: "SUBMITTED", reviewerId: null } });
          await tx.credentialAuditEvent.create({ data: { reviewId: id, actorId: actor.staffId, action: "LEGACY_ASSIGNMENT_RELEASED", revision: row.revision, fromStatus: "IN_REVIEW", toStatus: "SUBMITTED", note: "An obsolete personal reviewer assignment was released through management transition." } });
        } else if (kind === "identities") {
          if (!attempt || attempt.state !== "IN_REVIEW") throw fail(409, "Identity submission changed.");
          await tx.manualIdentityAttempt.updateMany({ where: { id: attempt.id, state: "IN_REVIEW" }, data: { state: "SUBMITTED", reviewerId: null } });
          await tx.manualIdentityAudit.create({ data: { requestId: id, targetAccountId: row.accountId, actorId: actor.staffId, action: "LEGACY_ASSIGNMENT_RELEASED", attemptId: attempt.id, fromState: "IN_REVIEW", toState: "SUBMITTED" } });
        } else if (kind === "photos") {
          await tx.profilePhotoReviewAudit.create({ data: { reviewId: id, actorId: actor.staffId, action: "LEGACY_ASSIGNMENT_RELEASED", fromState: "IN_REVIEW", toState: "PENDING" } });
        } else await tx.identityNameChangeAudit.create({ data: { requestId: id, actorId: actor.staffId, action: "LEGACY_ASSIGNMENT_RELEASED", fromState: "IN_REVIEW", toState: "SUBMITTED" } });
        const state = kind === "photos" ? "PENDING" : "SUBMITTED";
        if ((await tx[model].updateMany({ where: { id, version: expectedVersion }, data: { version, [kind === "credentials" ? "status" : "state"]: state, ...(kind === "identities" ? {} : { reviewerId: null }) } })).count !== 1) throw fail(409, "Assignment changed.");
        await audit(tx, actor, id, "LEGACY_ASSIGNMENT_RELEASED", { kind, previousActorId: previous, previousVersion: expectedVersion, version }, reason.trim());
        await root(tx, actor); return { id, kind, version, state };
      });
    },
  };
}
