import { digestOperation, lockOperationActors, operationAuthority, recordOperation, replayOperation } from "./management-operations.service.js";
import { conflictAccounts } from "./management-authority.js";
import { caseActionSchema, caseCreateSchema, caseQuerySchema, messageSchema, parse, uuid, operationError as fail } from "./management-operations.schema.js";
const permission = kind => kind === "SUPPORT" ? "support-agent" : "moderation-agent";
const closed = status => ["RESOLVED", "DISMISSED"].includes(status);
const summary = { id: true, kind: true, subject: true, status: true, priority: true, version: true, assignedStaffId: true, createdAt: true, updatedAt: true, closedAt: true };
const page = rows => ({ items: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19].id : null });
const pageOptions = cursor => ({ take: 21, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
export function createManagementCases({ prisma, now = () => new Date() }) {
  async function owner(db, actor, lock = false) {
    const id = actor.accountId;
    if (!uuid.safeParse(id).success || !uuid.safeParse(actor.sessionId).success) throw fail(403, "Personal sign-in is required.");
    if (lock) await lockOperationActors(db, [id]);
    const session = await db.session.findFirst({ where: { id:actor.sessionId, accountId:id, expiresAt:{gt:now()}, account:{status:"ACTIVE"} }, select:{ id:true,mfaVersion:true,mfaVerifiedAt:true } });
    const factor = await db.mfaFactor.findUnique({ where:{accountId:id}, select:{enabled:true,version:true} });
    if (!session || factor?.enabled && (!session.mfaVerifiedAt || session.mfaVersion !== factor.version)) throw fail(403, "A current personal sign-in is required.");
  }
  async function caseRecord(db, id) { const row = await db.managementCase.findUnique({ where: { id: parse(uuid, id) } }); if (!row) throw fail(404, "Case not found."); return row; }
  async function target(db, input) {
    if (!input.targetId && !input.targetUsername) return null;
    const row = await (input.targetType === "ACCOUNT" ? db.account : db.organization).findUnique({ where: input.targetId ? { id: input.targetId } : { username: input.targetUsername }, select: { id: true } });
    if (!row) throw fail(404, "Report target not found. Check the username."); return row.id;
  }
  async function noConflict(db, actorId, row) {
    if (row.targetType === "ORGANIZATION") await db.organization.updateMany({ where:{id:row.targetId},data:{accessVersion:{increment:0}} });
    const accounts = await conflictAccounts(db, actorId);
    if (accounts.includes(row.creatorAccountId) || row.targetType === "ACCOUNT" && accounts.includes(row.targetId) || row.targetType === "ORGANIZATION" && await db.organizationMembership.count({ where: { organizationId: row.targetId, accountId: { in: accounts }, enabled: true } })) throw fail(403, "Another authorized staff member must handle this related case.");
  }
  async function create(input, actor) {
    const data = parse(caseCreateSchema, input), mg = !!actor.staffId;
    if (mg) await operationAuthority(prisma, actor, permission(data.kind), now()); else await owner(prisma, actor);
    const creatorKey = mg ? `management:${actor.staffId}` : `personal:${actor.accountId}`, hash = digestOperation(data);
    return prisma.$transaction(async tx => {
      await lockOperationActors(tx, [mg ? actor.staffId : actor.accountId]);
      if (mg) await operationAuthority(tx, actor, permission(data.kind), now()); else await owner(tx, actor);
      const previous = await tx.managementCase.findUnique({ where: { creatorKey_idempotencyKey: { creatorKey, idempotencyKey: data.requestKey } } });
      if (previous) { if (previous.requestHash !== hash) throw fail(409, "That request key already belongs to a different case."); return { id: previous.id, version: previous.version }; }
      if (await tx.managementCase.count({ where: { creatorKey, createdAt: { gte: new Date(+now() - 3600000) } } }) >= 5) throw fail(429, "Case submission limit reached. Continue in an existing case or try again later.");
      const targetId = await target(tx, data);
      const row = await tx.managementCase.create({ data: { kind: data.kind, subject: data.subject, creatorKey, idempotencyKey: data.requestKey, requestHash: hash, ...(mg ? { createdByStaffId: actor.staffId } : { creatorAccountId: actor.accountId }), targetType: data.targetType, targetId } });
      await tx.managementCaseMessage.create({ data: { caseId: row.id, authorKey: creatorKey, idempotencyKey: data.requestKey, ...(mg ? { authorStaffId: actor.staffId } : { authorAccountId: actor.accountId }), body: data.body, internal: mg } });
      const result = { id: row.id, version: row.version };
      if (mg) await operationAuthority(tx,actor,permission(data.kind),now()); else await owner(tx,actor);
      if (mg) await recordOperation(tx, actor.staffId, data.requestKey, data, { action: "CASE_CREATED", targetType: "CASE", targetId: row.id, reason: "Created an internal operational case.", result });
      return result;
    });
  }
  async function detail(actor, id, messageCursor) {
    if (messageCursor) parse(uuid, messageCursor);
    const row = await caseRecord(prisma, id), mg = !!actor.staffId;
    const staff = mg ? await operationAuthority(prisma, actor, permission(row.kind), now()) : null;
    if (!mg) { await owner(prisma, actor); if (row.creatorAccountId !== actor.accountId) throw fail(404, "Case not found."); }
    const messages = await prisma.managementCaseMessage.findMany({ where: { caseId: row.id, ...(!mg ? { internal: false } : {}) }, take: 51, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...(messageCursor ? { cursor: { id: messageCursor }, skip: 1 } : {}), select: { id: true, body: true, internal: true, createdAt: true, authorAccountId: true, authorStaffId: true, ...(mg ? { authorStaff: { select: { username: true, fullName: true } } } : {}) } });
    const visible = messages.slice(0, 50).reverse().map(m => mg ? m : { id: m.id, body: m.body, createdAt: m.createdAt, author: m.authorStaffId ? "BrightWay Support" : "You" });
    if (mg) { const current = await operationAuthority(prisma, actor, permission(row.kind), now()); if (staff.version !== current.version) throw fail(403, "Management permissions changed."); }
    else await owner(prisma, actor);
    const publicRow = Object.fromEntries(Object.keys(summary).map(key => [key, row[key]]));
    if (!mg) delete publicRow.assignedStaffId;
    return { ...publicRow, ...(mg ? { creatorAccountId: row.creatorAccountId, createdByStaffId: row.createdByStaffId, targetType: row.targetType, targetId: row.targetId } : {}), messages: visible, nextMessageCursor: messages.length > 50 ? messages[49].id : null };
  }
  return {
    create, detail,
    async list(actor, query) {
      const data = parse(caseQuerySchema, query), mg = !!actor.staffId;
      const staff = mg ? await operationAuthority(prisma, actor, permission(data.kind), now()) : null;
      if (!mg) await owner(prisma, actor);
      const rows = await prisma.managementCase.findMany({ where: { kind: data.kind, ...(!mg ? { creatorAccountId: actor.accountId } : {}), ...(data.status ? { status: data.status } : {}), ...(data.q ? { OR: [{ subject: { contains: data.q, mode: "insensitive" } }, ...(uuid.safeParse(data.q).success ? [{ id: data.q }] : [])] } : {}) }, select: summary, ...pageOptions(data.cursor) });
      if (mg) { const current = await operationAuthority(prisma, actor, permission(data.kind), now()); if (staff.version !== current.version) throw fail(403, "Management permissions changed."); }
      else await owner(prisma, actor);
      return page(rows.map(row => { if (!mg) { const { assignedStaffId: _omitted, ...rest } = row; return rest; } return row; }));
    },
    async action(actor, id, input) {
      const data = parse(caseActionSchema, input), snapshot = await caseRecord(prisma, id), value = { id, ...data };
      await operationAuthority(prisma, actor, permission(snapshot.kind), now(), true);
      return prisma.$transaction(async tx => {
        await lockOperationActors(tx, [actor.staffId]); const staff = await operationAuthority(tx, actor, permission(snapshot.kind), now(), true);
        const old = await replayOperation(tx, actor.staffId, data.requestKey, value); if (old) return old;
        const row = await caseRecord(tx, id); await noConflict(tx, actor.staffId, row);
        if (row.version !== data.expectedVersion) throw fail(409, "This case changed. Reload before continuing.");
        const fields = {};
        if (data.action === "ASSIGN_SELF") {
          if (closed(row.status) || row.assignedStaffId) throw fail(409, "This case is closed or already assigned.");
          Object.assign(fields, { assignedStaffId: actor.staffId, status: "IN_PROGRESS" });
        } else if (data.action === "RELEASE") {
          if (!row.assignedStaffId || row.assignedStaffId !== actor.staffId && !staff.isSuperAdmin || closed(row.status)) throw fail(403, "Only the assignee or Super Admin can release an open case.");
          Object.assign(fields, { assignedStaffId: null, status: "OPEN" });
        } else {
          if (row.assignedStaffId !== actor.staffId) throw fail(403, "Assign the case to yourself before changing it.");
          if (data.action === "STATUS") {
            if (row.status === data.status) throw fail(409, "That status is already saved.");
            if (data.status === "WAITING_FOR_USER" && !row.creatorAccountId) throw fail(400, "An internal case has no applicant to reply.");
            Object.assign(fields, { status: data.status, closedAt: closed(data.status) ? now() : null });
          } else { if (row.priority === data.priority) throw fail(409, "That priority is already saved."); fields.priority = data.priority; }
        }
        if ((await tx.managementCase.updateMany({ where: { id, version: data.expectedVersion }, data: { ...fields, version: { increment: 1 } } })).count !== 1) throw fail(409, "This case changed. Reload before continuing.");
        if (data.action === "STATUS" && row.creatorAccountId) await tx.managementCaseMessage.create({ data: { caseId: id, authorKey: `management:${actor.staffId}`, authorStaffId: actor.staffId, idempotencyKey: data.requestKey, body: data.reason, internal: false } });
        const result = { id, version: row.version + 1 };
        await operationAuthority(tx,actor,permission(row.kind),now(),true);
        return recordOperation(tx, actor.staffId, data.requestKey, value, { action: `CASE_${data.action}`, targetType: "CASE", targetId: id, reason: data.reason, result });
      });
    },
    async message(actor, id, input) {
      const data = parse(messageSchema, input), snapshot = await caseRecord(prisma, id), mg = !!actor.staffId, authorKey = mg ? `management:${actor.staffId}` : `personal:${actor.accountId}`;
      if (mg && !snapshot.creatorAccountId && !data.internal) throw fail(400, "Use an internal note for an internally created case.");
      if (!mg && data.internal) throw fail(400, "Applicants cannot create internal notes.");
      if (mg) await operationAuthority(prisma, actor, permission(snapshot.kind), now()); else { await owner(prisma, actor); if (snapshot.creatorAccountId !== actor.accountId) throw fail(404, "Case not found."); }
      return prisma.$transaction(async tx => {
        await lockOperationActors(tx, [mg ? actor.staffId : actor.accountId]);
        const row = await caseRecord(tx, id);
        if (mg) { await operationAuthority(tx, actor, permission(row.kind), now()); await noConflict(tx, actor.staffId, row); if (row.assignedStaffId !== actor.staffId) throw fail(403, "Assign the case to yourself before replying."); }
        else { await owner(tx, actor); if (row.creatorAccountId !== actor.accountId) throw fail(404, "Case not found."); }
        const old = await tx.managementCaseMessage.findUnique({ where: { caseId_authorKey_idempotencyKey: { caseId: id, authorKey, idempotencyKey: data.requestKey } } });
        if (old) { if (old.body !== data.body || old.internal !== data.internal) throw fail(409, "That message key was already used for different input."); return { id: row.id, version: row.version }; }
        if (closed(row.status) || row.version !== data.expectedVersion) throw fail(409, "This case is closed or changed. Reload before replying.");
        if (await tx.managementCaseMessage.count({ where: { authorKey, createdAt: { gte: new Date(+now() - 3600000) } } }) >= 30) throw fail(429, "Message limit reached. Please try again later.");
        if ((await tx.managementCase.updateMany({ where: { id, version: row.version }, data: { version: { increment: 1 }, ...(!mg && row.status === "WAITING_FOR_USER" ? { status: "OPEN" } : {}) } })).count !== 1) throw fail(409, "This case changed. Reload before replying.");
        await tx.managementCaseMessage.create({ data: { caseId: id, authorKey, idempotencyKey: data.requestKey, ...(mg ? { authorStaffId: actor.staffId } : { authorAccountId: actor.accountId }), body: data.body, internal: data.internal } });
        const result = { id, version: row.version + 1 };
        if (mg) await operationAuthority(tx,actor,permission(row.kind),now()); else await owner(tx,actor);
        if (mg) await recordOperation(tx, actor.staffId, data.requestKey, { id, ...data }, { action: data.internal ? "CASE_INTERNAL_NOTE" : "CASE_REPLY", targetType: "CASE", targetId: id, reason: "Case message recorded; body remains in its scoped case thread.", result });
        return result;
      });
    },
  };
}
