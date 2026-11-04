import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { assertManagementSession, permits, staffId, conflictAccounts } from "./management-authority.js";
import { actionSchema, pageSchema, auditQuerySchema, auditCursorSchema, uuid, parse, operationError as fail } from "./management-operations.schema.js";
export const digestOperation = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const page = rows => ({ items: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19].id : null });
const paging = cursor => ({ take: 21, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
export const userSelect = { id: true, username: true, status: true, accessVersion: true, emailVerifiedAt: true, createdAt: true, lastLoginAt: true, person: { select: { firstName: true, lastName: true } } };
const organizationSelect = { id: true, name: true, username: true, type: true, status: true, accessVersion: true, verifiedAt: true, createdAt: true, profileReadyAt: true };
export async function operationAuthority(db, actor, capability, now, fresh = false) {
  const staff = await assertManagementSession(db, actor.staffId, actor.sessionId, now, fresh);
  if (!permits(staff, capability)) throw fail(403, "This management permission is required.");
  return staff;
}
export async function lockOperationActors(tx, ids) {
  for (const id of [...new Set(ids)].sort()) {
    if (!staffId(id) && !uuid.safeParse(id).success) throw fail(403, "A valid actor is required.");
    if (staffId(id)) {
      if ((await tx.managementStaff.updateMany({ where: { id, status: "ACTIVE" }, data: { failureCount: { increment: 0 } } })).count !== 1) throw fail(403, "Current management access is required.");
    } else if ((await tx.account.updateMany({ where: { id }, data: { accessVersion: { increment: 0 } } })).count !== 1) throw fail(404, "Account not found.");
  }
}
export async function replayOperation(tx, actorId, requestKey, value) {
  const old = await tx.managementAction.findUnique({ where: { actorId_requestKey: { actorId, requestKey } } });
  if (!old) return null;
  if (old.requestHash !== digestOperation(value)) throw fail(409, "This operation key was already used for different input. Reload the saved result.");
  return old.result;
}
export async function recordOperation(tx, actorId, requestKey, value, { action, targetType, targetId, reason, result }) {
  await tx.managementAction.create({ data: { actorId, requestKey, requestHash: digestOperation(value), action, targetType, targetId, reason, result } });
  return result;
}
export function createManagementOperations({ prisma, now = () => new Date() }) {
  async function read(actor, capability, work) {
    const staff = await operationAuthority(prisma, actor, capability, now());
    const result = await work();
    const current = await operationAuthority(prisma, actor, capability, now());
    if (current.version !== staff.version) throw fail(403, "Management access changed. Reload before continuing.");
    return result;
  }
  async function directory(actor, kind, query) {
    const q = parse(pageSchema, query), capability = kind === "users" ? "user-manager" : kind === "organizations" ? "organization-manager" : "staff-reader";
    const statuses = kind === "team" ? ["PENDING", "ACTIVE", "DISABLED"] : kind === "users" ? ["ACTIVE", "SUSPENDED", "DEACTIVATED"] : ["ACTIVE", "SUSPENDED"];
    if (q.status && !statuses.includes(q.status)) throw fail(400, "Unknown directory status.");
    return read(actor, capability, async () => {
      const searchFields = kind === "organizations" ? ["name", "username"] : kind === "team" ? ["fullName", "username"] : ["username"];
      const where = { ...(q.status ? { status: q.status } : {}), ...(q.q ? { OR: [...searchFields.map(key => ({ [key]: { contains: q.q, mode: "insensitive" } })), ...(kind === "users" ? [{ person: { firstName: { contains: q.q, mode: "insensitive" } } }, { person: { lastName: { contains: q.q, mode: "insensitive" } } }] : []), ...(uuid.safeParse(q.q).success ? [{ id: q.q }] : [])] } : {}) };
      if (kind === "users") return page(await prisma.account.findMany({ where, ...paging(q.cursor), select: userSelect }));
      if (kind === "organizations") return page(await prisma.organization.findMany({ where, ...paging(q.cursor), select: organizationSelect }));
      const rows = await prisma.managementStaff.findMany({ where, ...paging(q.cursor), select: { id: true, username: true, fullName: true, status: true, isSuperAdmin: true, capabilities: true, version: true, emailVerifiedAt: true, createdAt: true } });
      return page(rows);
    });
  }
  return {
    directory,
    async entity(actor, kind, id) {
      parse(uuid, id); if (!["users", "organizations"].includes(kind)) throw fail(404, "Unknown directory.");
      return read(actor, kind === "users" ? "user-manager" : "organization-manager", async () => {
        const entity = kind === "users" ? await prisma.account.findUnique({ where: { id }, select: userSelect }) : await prisma.organization.findUnique({ where: { id }, select: organizationSelect });
        if (!entity) throw fail(404, "Record not found.");
        const history = await prisma.managementAction.findMany({ where: { targetType: kind === "users" ? "ACCOUNT" : "ORGANIZATION", targetId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, select: { id: true, action: true, actor: { select: { username: true, fullName: true } }, reason: true, createdAt: true } });
        const activeSessions = kind === "users" ? await prisma.session.count({ where: { accountId: id, expiresAt: { gt: now() } } }) : undefined;
        return { entity, history, ...(activeSessions !== undefined ? { activeSessions } : {}) };
      });
    },
    async control(actor, kind, id, input) {
      parse(uuid, id); const data = parse(actionSchema, input), isUser = kind === "users";
      if (!["users", "organizations"].includes(kind) || !isUser && data.action === "SIGN_OUT") throw fail(400, "Unknown account operation.");
      const capability = isUser ? "user-manager" : "organization-manager", targetType = isUser ? "ACCOUNT" : "ORGANIZATION", value = { kind, id, ...data };
      await operationAuthority(prisma, actor, capability, now(), true);
      return prisma.$transaction(async tx => {
        await lockOperationActors(tx, [actor.staffId, ...(isUser ? [id] : [])]);
        await operationAuthority(tx, actor, capability, now(), true);
        const replay = await replayOperation(tx, actor.staffId, data.requestKey, value); if (replay) return replay;
        const related = await conflictAccounts(tx, actor.staffId);
        const entity = await (isUser ? tx.account : tx.organization).findUnique({ where: { id }, ...(isUser ? { select: userSelect } : { include: { request: { select: { applicantId: true } } } }) });
        if (!entity) throw fail(404, "Record not found.");
        if (isUser ? related.includes(id) : related.includes(entity.request.applicantId) || await tx.organizationMembership.count({ where: { organizationId: id, accountId: { in: related }, enabled: true } })) throw fail(403, "A different authorized staff member must handle this related account or organization.");
        if (entity.accessVersion !== data.expectedVersion) throw fail(409, "This record changed. Reload it before choosing another action.");
        const status = data.action === "SUSPEND" ? "SUSPENDED" : data.action === "RESTORE" ? "ACTIVE" : entity.status;
        if (data.action === "SUSPEND" && entity.status !== "ACTIVE" || data.action === "RESTORE" && entity.status !== "SUSPENDED" || data.action === "SIGN_OUT" && entity.status !== "ACTIVE") throw fail(409, "This action does not apply to the current saved status.");
        const changed = await (isUser ? tx.account : tx.organization).updateMany({ where: { id, accessVersion: entity.accessVersion, status: entity.status }, data: { status, accessVersion: { increment: 1 }, ...(!isUser ? { staffVersion: { increment: 1 } } : {}) } });
        if (changed.count !== 1) throw fail(409, "This record changed. Reload before continuing.");
        let sessionsRevoked = 0;
        if (isUser) {
          sessionsRevoked = (await tx.session.deleteMany({ where: { accountId: id } })).count;
          await tx.mfaLoginChallenge.updateMany({ where: { accountId: id }, data: { consumedAt: now() } });
          await tx.passwordResetChallenge.updateMany({ where: { accountId: id }, data: { consumedAt: now(), ready: false } });
        }
        const result = { id, status, accessVersion: entity.accessVersion + 1, ...(isUser ? { sessionsRevoked } : {}) };
        await operationAuthority(tx, actor, capability, now(), true);
        return recordOperation(tx, actor.staffId, data.requestKey, value, { action: `${targetType}_${data.action}`, targetType, targetId: id, reason: data.reason, result });
      });
    },
    async audit(actor, query) {
      const q = parse(auditQuerySchema, query); if (q.status) throw fail(400, "Use search and pagination for the audit log.");
      return read(actor, "audit-reader", async () => {
        let cursor = null;
        if (q.cursor) { try { cursor = parse(auditCursorSchema, JSON.parse(Buffer.from(q.cursor,"base64url").toString("utf8"))); } catch { throw fail(400,"Invalid audit cursor. Start from the first page."); } }
        const rows = await prisma.$queryRaw(Prisma.sql`WITH events AS (
          SELECT "id", "createdAt", "actorId", "action", "targetId", "targetType", 'OPERATIONS' AS source FROM "ManagementAction"
          UNION ALL SELECT "id", "createdAt", "actorId", "action", "targetStaffId", 'STAFF', 'STAFF' FROM "ManagementStaffAudit"
          UNION ALL SELECT "id", "createdAt", "actorId", "action", "reviewId", 'CREDENTIAL', 'CREDENTIAL' FROM "CredentialAuditEvent"
          UNION ALL SELECT "id", "createdAt", "actorId", "action", COALESCE("requestId", "targetAccountId"), 'IDENTITY', 'IDENTITY' FROM "ManualIdentityAudit"
          UNION ALL SELECT "id", "createdAt", "actorId", "action", "requestId", 'ORGANIZATION_REQUEST', 'ORGANIZATION' FROM "OrganizationRequestAudit"
          UNION ALL SELECT "id", "createdAt", "actorId", "action", "reviewId", 'PHOTO', 'PHOTO' FROM "ProfilePhotoReviewAudit"
          UNION ALL SELECT "id", "createdAt", "actorId", "action", "requestId", 'NAME', 'NAME' FROM "IdentityNameChangeAudit")
          SELECT e.*, COALESCE(s.username, a.username, e."actorId") AS "actorUsername" FROM events e
          LEFT JOIN "ManagementStaff" s ON s.id = e."actorId" LEFT JOIN "Account" a ON a.id = e."actorId"
          WHERE (${q.q} = '' OR POSITION(LOWER(${q.q}) IN LOWER(e.action || ' ' || e."targetId" || ' ' || COALESCE(s.username,a.username,e."actorId"))) > 0)
          ${cursor ? Prisma.sql`AND (e."createdAt",e.id,e.source) < (${new Date(cursor.at)},${cursor.id},${cursor.source})` : Prisma.empty}
          ORDER BY e."createdAt" DESC,e.id DESC,e.source DESC LIMIT 21`);
        return { items:rows.slice(0,20), nextCursor: rows.length > 20 ? Buffer.from(JSON.stringify({ at:rows[19].createdAt.toISOString(), id:rows[19].id, source:rows[19].source })).toString("base64url") : null };
      });
    },
    async operations(actor) {
      return read(actor, "operations-reader", async () => {
        const date = now();
        const rows = await prisma.$queryRaw(Prisma.sql`SELECT
          (SELECT COUNT(*)::int FROM "ManualIdentityRequest" WHERE state IN ('SUBMITTED','IN_REVIEW') AND "targetAt" < ${date}) AS "identityPastTarget",
          (SELECT COUNT(*)::int FROM "CredentialReview" WHERE status IN ('SUBMITTED','IN_REVIEW') AND "initialSubmittedAt" < ${new Date(+date - 7 * 86400000)}) AS "credentialPastTarget",
          (SELECT COUNT(*)::int FROM "OrganizationRequest" WHERE status IN ('SUBMITTED','ASSIGNED','RECOMMENDED') AND "targetAt" < ${date}) AS "organizationPastTarget",
          (SELECT COUNT(*)::int FROM "ManagementCase" WHERE status NOT IN ('RESOLVED','DISMISSED')) AS "openCases",
          (SELECT COUNT(*)::int FROM "IdentityWebhookJob" WHERE state = 'PENDING') AS "pendingWebhookJobs",
          (SELECT COUNT(*)::int FROM "IdentityWebhookJob" WHERE state = 'FAILED') AS "failedWebhookJobs",
          (SELECT COUNT(*)::int FROM "ManagementSession" WHERE "expiresAt" <= ${date}) AS "expiredManagementSessions",
          (SELECT COUNT(*)::int FROM "ManagementChallenge" WHERE "expiresAt" <= ${date} OR "consumedAt" IS NOT NULL) AS "expiredManagementProofs",
          (SELECT COUNT(*)::int FROM "ManualIdentityAttempt" WHERE "purgedAt" IS NULL AND "purgeAt" <= ${date}) AS "identityRetentionDue",
          (SELECT COUNT(*)::int FROM "ManualIdentityEvidence" WHERE state = 'DELETE_PENDING') AS "identityDeletionPending"`);
        return { asOf: date.toISOString(), counts: rows[0] };
      });
    },
  };
}
