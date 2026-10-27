import { randomUUID } from "node:crypto";
import { assertMfaSession } from "../auth/mfa.service.js";
import { organizationRequestSchema, assignOrganizationSchema, organizationFindingSchema, organizationDecisionSchema, allChecks, digest, failure as fail, parse, requestId } from "./organization.schema.js";
const active = ["SUBMITTED", "ASSIGNED", "RECOMMENDED"], DAY = 86400000;
const conflict = () => fail(409, "This organization request changed. Reload before continuing.");
export function createOrganizationService({ prisma, now = () => new Date() }) {
  async function transaction(work) {
    try { return await prisma.$transaction(work); }
    catch (e) { if (["P2002", "P2034"].includes(e.code)) throw conflict(); throw e; }
  }
  async function lock(db, ids) {
    for (const id of [...new Set(ids)].sort()) {
      if (typeof id !== "string" || !id || (await db.account.updateMany({ where: { id, status: "ACTIVE" }, data: { identityRevision: { increment: 0 } } })).count !== 1) throw fail(403, "An active account is required.");
    }
  }
  async function live(db, actorId, sessionId) {
    if (typeof actorId !== "string" || !actorId.trim() || typeof sessionId !== "string" || !sessionId.trim()) throw fail(401, "Please sign in again.");
    const account = await db.account.findUnique({ where: { id: actorId } });
    const session = await db.session.findFirst({ where: { id: sessionId, accountId: actorId, expiresAt: { gt: now() } } });
    if (!account || account.status !== "ACTIVE" || !session) throw fail(401, "Please sign in again.");
    if ((await db.mfaFactor.findUnique({ where: { accountId: actorId } }))?.enabled) await assertMfaSession(db, actorId, sessionId, now());
    return account;
  }
  async function capability(db, actorId, sessionId, role) {
    const account = await live(db, actorId, sessionId), roles = await db.organizationOperator.findUnique({ where: { accountId: actorId } });
    if (!account.emailVerifiedAt || (role === "agent" ? roles?.agentEnabled !== true : role === "approver" ? roles?.approverEnabled !== true : !roles?.agentEnabled && !roles?.approverEnabled)) throw fail(403, "Organization verification permission is required.");
    await assertMfaSession(db, actorId, sessionId, now());
    return roles;
  }
  async function row(db, id) { const r = await db.organizationRequest.findUnique({ where: { id } }); if (!r) throw fail(404, "Organization request not found."); return r; }
  async function audit(db, r, actorId, action, next, version) {
    await db.organizationRequestAudit.create({ data: { requestId: r.id, actorId, action, fromStatus: action === "SUBMITTED" ? null : r.status, toStatus: next, version } });
  }
  async function ownerView(db, r) {
    const organization = await db.organization.findUnique({ where: { requestId: r.id }, select: { id: true } });
    return { id: r.id, name: r.name, type: r.type, representativeRole: r.representativeRole,
      location: { countryCode: r.countryCode, region: r.region, city: r.city, address: r.address }, offersTraining: r.offersTraining,
      status: r.status, version: r.version, createdAt: r.createdAt, targetAt: r.targetAt, overdue: active.includes(r.status) && r.targetAt <= now(),
      decisionReason: r.decisionReason, decidedAt: r.decidedAt, organizationId: organization?.id ?? null };
  }
  async function operatorDetail(db, actorId, sessionId, r, roles) {
    if (r.applicantId === actorId || (!roles.approverEnabled && r.assignedAgentId !== actorId)) throw fail(403, "You cannot access this organization review.");
    const applicant = await db.account.findUnique({ where: { id: r.applicantId }, select: { username: true } });
    const finding = await db.organizationFinding.findUnique({ where: { requestId: r.id } });
    const permitted = roles.approverEnabled || r.assignedAgentId === actorId;
    const findingHistory = roles.approverEnabled ? await db.organizationFindingArchive.findMany({ where: { requestId: r.id }, orderBy: [{ sourceVersion: "desc" }, { id: "desc" }], take: 10 }) : [];
    const investigated = roles.approverEnabled && !!await db.organizationFindingArchive.findFirst({ where: { requestId: r.id, agentId: actorId } });
    const assignedRole = r.assignedAgentId ? await db.organizationOperator.findUnique({ where: { accountId: r.assignedAgentId } }) : null;
    const assignedAccount = r.assignedAgentId ? await db.account.findUnique({ where: { id: r.assignedAgentId } }) : null;
    const requiresReassignment = r.status === "RECOMMENDED" && (!assignedRole?.agentEnabled || assignedAccount?.status !== "ACTIVE" || !assignedAccount.emailVerifiedAt);
    await capability(db, actorId, sessionId);
    return { ...await ownerView(db, r), applicantUsername: applicant?.username, assignedAgentId: r.assignedAgentId,
      finding: permitted ? finding : null, findingHistory, requiresReassignment, canAssign: roles.approverEnabled && ["SUBMITTED", "ASSIGNED", "RECOMMENDED"].includes(r.status),
      canReport: roles.agentEnabled && r.assignedAgentId === actorId && r.status === "ASSIGNED",
      canDecide: roles.approverEnabled && r.status === "RECOMMENDED" && !requiresReassignment && !investigated && r.assignedAgentId !== actorId };
  }
  const service = {
    async access(actorId, sessionId) {
      await live(prisma, actorId, sessionId);
      const account = await prisma.account.findUnique({ where: { id: actorId }, select: { emailVerifiedAt: true } });
      const r = await prisma.organizationOperator.findUnique({ where: { accountId: actorId } });
      return { agent: !!account.emailVerifiedAt && r?.agentEnabled === true, approver: !!account.emailVerifiedAt && r?.approverEnabled === true };
    },
    async submit(actorId, sessionId, supplied) {
      const data = parse(organizationRequestSchema, supplied), { idempotencyKey, ...fields } = data;
      const inputHash = digest(fields), fingerprint = digest([fields.type, fields.name.toLowerCase(), fields.countryCode, fields.region.toLowerCase(), fields.city.toLowerCase(), fields.address.toLowerCase()]);
      return transaction(async tx => {
        await lock(tx, [actorId]); await live(tx, actorId, sessionId);
        const prior = await tx.organizationRequest.findUnique({ where: { applicantId_idempotencyKey: { applicantId: actorId, idempotencyKey } } });
        if (prior) { if (prior.inputHash !== inputHash) throw conflict(); return ownerView(tx, prior); }
        if (await tx.organizationRequest.findFirst({ where: { applicantId: actorId, fingerprint, status: { in: active } } })) throw fail(409, "You already have an active request for this organization. Open your requests.");
        if (await tx.organizationRequest.count({ where: { applicantId: actorId, createdAt: { gte: new Date(+now() - DAY) } } }) >= 5) throw fail(429, "Organization request limit reached. Try again later.");
        const r = await tx.organizationRequest.create({ data: { id: randomUUID(), applicantId: actorId, idempotencyKey, inputHash, fingerprint, ...fields, targetAt: new Date(+now() + 72 * 3600000) } });
        await audit(tx, r, actorId, "SUBMITTED", "SUBMITTED", 1); await live(tx, actorId, sessionId);
        return ownerView(tx, r);
      });
    },
    async ownerList(actorId, sessionId, cursor) {
      await live(prisma, actorId, sessionId); if (cursor) requestId(cursor);
      // Bind a supplied cursor to the owner; never allow another owner's cursor to move the window.
      if (cursor && (await row(prisma, cursor)).applicantId !== actorId) throw fail(404, "Organization request not found.");
      const rows = await prisma.organizationRequest.findMany({ where: { applicantId: actorId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 21 });
      return { requests: await Promise.all(rows.slice(0, 20).map(r => ownerView(prisma, r))), nextCursor: rows.length > 20 ? rows[19].id : null };
    },
    async owner(actorId, sessionId, id) {
      requestId(id); await live(prisma, actorId, sessionId); const r = await row(prisma, id);
      if (r.applicantId !== actorId) throw fail(404, "Organization request not found."); return ownerView(prisma, r);
    },
    async queue(actorId, sessionId, cursor) {
      if (cursor) requestId(cursor);
      return transaction(async tx => {
        await lock(tx, [actorId]); const roles = await capability(tx, actorId, sessionId);
        if (cursor) { const c = await row(tx, cursor); if (c.applicantId === actorId || !roles.approverEnabled && c.assignedAgentId !== actorId) throw fail(404, "Organization request not found."); }
        const rows = await tx.organizationRequest.findMany({ where: { applicantId: { not: actorId }, status: { in: active }, ...(!roles.approverEnabled ? { assignedAgentId: actorId } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 21 });
        return { requests: rows.slice(0, 20).map(r => ({ id: r.id, name: r.name, type: r.type, countryCode: r.countryCode, city: r.city, status: r.status, version: r.version, targetAt: r.targetAt, overdue: r.targetAt <= now() })), nextCursor: rows.length > 20 ? rows[19].id : null };
      });
    },
    async detail(actorId, sessionId, id) {
      requestId(id); return transaction(async tx => { await lock(tx, [actorId]); const roles = await capability(tx, actorId, sessionId); return operatorDetail(tx, actorId, sessionId, await row(tx, id), roles); });
    },
    async assign(actorId, sessionId, id, body) {
      requestId(id); const data = parse(assignOrganizationSchema, body);
      await capability(prisma, actorId, sessionId, "approver");
      const known = await row(prisma, id), target = await prisma.account.findUnique({ where: { username: data.agentUsername }, select: { id: true } });
      if (!target) throw fail(400, "Choose an active authorized Agent username.");
      return transaction(async tx => {
        await lock(tx, [actorId, known.applicantId, target.id]); await capability(tx, actorId, sessionId, "approver");
        const r = await row(tx, id), targetRole = await tx.organizationOperator.findUnique({ where: { accountId: target.id } }), targetAccount = await tx.account.findUnique({ where: { id: target.id } });
        if (actorId === r.applicantId || target.id === r.applicantId) throw fail(403, "Applicants cannot assign or investigate their own request.");
        if (!targetRole?.agentEnabled || !targetAccount?.emailVerifiedAt) throw fail(400, "Choose an active authorized Agent username.");
        if (r.version !== data.expectedVersion || !["SUBMITTED", "ASSIGNED", "RECOMMENDED"].includes(r.status)) throw conflict();
        const replacing = r.status === "RECOMMENDED";
        if (replacing && target.id === r.assignedAgentId) throw fail(400, "Choose a different Agent for a fresh investigation.");
        const previousFinding = replacing ? await tx.organizationFinding.findUnique({ where: { requestId: id } }) : null;
        if (replacing && (!previousFinding || previousFinding.agentId !== r.assignedAgentId)) throw conflict();
        const changed = await tx.organizationRequest.updateMany({ where: { id, version: r.version, status: r.status }, data: { assignedAgentId: target.id, status: "ASSIGNED", version: { increment: 1 } } });
        if (changed.count !== 1) throw conflict();
        if (replacing) {
          // Preserve the exact prior investigation privately; it can no longer authorize a decision.
          await tx.organizationFindingArchive.create({ data: { ...previousFinding, sourceVersion: r.version, retiredAt: now(), retiredById: actorId } });
          if ((await tx.organizationFinding.deleteMany({ where: { requestId: id, agentId: r.assignedAgentId } })).count !== 1) throw conflict();
        }
        await audit(tx, r, actorId, replacing ? "REASSIGNED" : "ASSIGNED", "ASSIGNED", r.version + 1); await capability(tx, actorId, sessionId, "approver");
        return { id, status: "ASSIGNED", version: r.version + 1 };
      });
    },
    async report(actorId, sessionId, id, body) {
      requestId(id); const { expectedVersion, ...finding } = parse(organizationFindingSchema, body);
      return transaction(async tx => {
        await lock(tx, [actorId]); await capability(tx, actorId, sessionId, "agent"); const r = await row(tx, id);
        if (r.applicantId === actorId || r.assignedAgentId !== actorId) throw fail(403, "Only the assigned Agent can submit findings.");
        if (r.status !== "ASSIGNED" || r.version !== expectedVersion) throw conflict();
        if ((await tx.organizationRequest.updateMany({ where: { id, assignedAgentId: actorId, version: expectedVersion, status: "ASSIGNED" }, data: { status: "RECOMMENDED", version: { increment: 1 } } })).count !== 1) throw conflict();
        await tx.organizationFinding.create({ data: { requestId: id, agentId: actorId, ...finding } });
        await audit(tx, r, actorId, "FINDINGS_RECORDED", "RECOMMENDED", expectedVersion + 1); await capability(tx, actorId, sessionId, "agent");
        return { id, status: "RECOMMENDED", version: expectedVersion + 1 };
      });
    },
    async decide(actorId, sessionId, id, body) {
      requestId(id); const data = parse(organizationDecisionSchema, body); await capability(prisma, actorId, sessionId, "approver"); const known = await row(prisma, id);
      return transaction(async tx => {
        await lock(tx, [actorId, known.applicantId, ...(known.assignedAgentId ? [known.assignedAgentId] : [])]); await capability(tx, actorId, sessionId, "approver");
        const r = await row(tx, id);
        if (actorId === r.applicantId || actorId === r.assignedAgentId || await tx.organizationFindingArchive.findFirst({ where: { requestId: id, agentId: actorId } })) throw fail(403, "A separate approver who has not investigated this request must decide it.");
        if (r.version !== data.expectedVersion || r.status !== "RECOMMENDED" || r.assignedAgentId !== known.assignedAgentId) throw conflict();
        const finding = await tx.organizationFinding.findUnique({ where: { requestId: id } }), agentRole = await tx.organizationOperator.findUnique({ where: { accountId: r.assignedAgentId } });
        const agent = await tx.account.findUnique({ where: { id: r.assignedAgentId } });
        if (!finding || finding.agentId !== r.assignedAgentId || !agentRole?.agentEnabled || !agent.emailVerifiedAt) throw fail(409, "Agent authorization or findings changed. Review the assignment before deciding.");
        if (data.decision === "APPROVE" && (finding.recommendation !== "APPROVE" || !allChecks(finding))) throw fail(409, "Approval requires a complete positive Agent recommendation.");
        const status = data.decision === "APPROVE" ? "APPROVED" : "REJECTED";
        if ((await tx.organizationRequest.updateMany({ where: { id, status: "RECOMMENDED", version: r.version }, data: { status, decisionReason: data.reason, decidedById: actorId, decidedAt: now(), version: { increment: 1 } } })).count !== 1) throw conflict();
        let organization = null;
        if (status === "APPROVED") organization = await tx.organization.create({ data: {
          name: r.name, type: r.type, offersTraining: r.offersTraining, requestId: id, verifiedAt: now(),
          locations: { create: { countryCode: r.countryCode, region: r.region, city: r.city, address: r.address, verifiedAt: now() } },
          memberships: { create: { accountId: r.applicantId, role: "PRIMARY_ADMIN" } },
        } });
        await audit(tx, r, actorId, status, status, r.version + 1); await capability(tx, actorId, sessionId, "approver");
        const finalAgentRole = await tx.organizationOperator.findUnique({ where: { accountId: r.assignedAgentId } });
        if (!finalAgentRole?.agentEnabled) throw fail(403, "Agent authorization was revoked.");
        return { id, status, version: r.version + 1, organizationId: organization?.id ?? null };
      });
    },
    async publicOrganization(id) {
      requestId(id);
      const org = await prisma.organization.findFirst({ where: { id, status: "ACTIVE", request: { status: "APPROVED" } }, select: { id: true, name: true, type: true, offersTraining: true, verifiedAt: true,
        locations: { select: { countryCode: true, region: true, city: true, address: true, primary: true, verifiedAt: true } } } });
      if (!org) throw fail(404, "Organization not found."); return { ...org, verified: true };
    },
  };
  return service;
}
