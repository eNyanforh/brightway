import { requireOrganizationProfile, organizationProfileReady } from "./organization-profile.schema.js";
import { organizationWorkspace } from "../../../../shared/organization-workspace.mjs";
import { randomUUID } from "node:crypto";
import { assertMfaSession } from "../auth/mfa.service.js";
import { digest, failure as fail, parse, requestId } from "./organization.schema.js";
import { PERMISSIONS, workspaceDirectorySchema, organizationPermissionKeys, inviteSchema, changeMemberSchema, cancelInviteSchema, respondInviteSchema, listStaffSchema } from "./organization-staff.schema.js";
const MANAGE = "organization.members.manage", conflict = () => fail(409, "Organization staffing changed. Reload before continuing.");
export function createOrganizationStaffService({ prisma, now = () => new Date() }) {
  async function transaction(work) { try { return await prisma.$transaction(work); } catch (e) { if (["P2002", "P2034"].includes(e.code)) throw conflict(); throw e; } }
  async function live(db, actorId, sessionId) {
    if (typeof actorId !== "string" || !actorId || typeof sessionId !== "string" || !sessionId) throw fail(401, "Please sign in again.");
    const account = await db.account.findUnique({ where: { id: actorId } });
    if (account?.status !== "ACTIVE" || !await db.session.findFirst({ where: { id: sessionId, accountId: actorId, expiresAt: { gt: now() } } })) throw fail(401, "Please sign in again.");
    if ((await db.mfaFactor.findUnique({ where: { accountId: actorId } }))?.enabled) await assertMfaSession(db, actorId, sessionId, now());
    return account;
  }
  async function lock(db, ids) { for (const id of [...new Set(ids)].sort()) if (!id || (await db.account.updateMany({ where: { id, status: "ACTIVE" }, data: { identityRevision: { increment: 0 } } })).count !== 1) throw fail(403, "An active account is required."); }
  async function org(db, id, write = false) {
    const result = await db.organization.findFirst({ where: { id, status: "ACTIVE", request: { status: "APPROVED" } } });
    if (!result) throw fail(404, "Organization workspace is unavailable.");
    if (write && (await db.organization.updateMany({ where: { id, status: "ACTIVE" }, data: { staffVersion: { increment: 0 } } })).count !== 1) throw conflict();
    return result;
  }
  const catalog = organizationPermissionKeys;
  const effective = (membership, organization) => membership?.enabled ? (membership.role === "PRIMARY_ADMIN" ? catalog(organization) : (membership.permissions ?? []).filter(p => catalog(organization).includes(p))) : [];
  async function access(db, actorId, sessionId, organization, manage = false, allowSetup = false) {
    const account = await live(db, actorId, sessionId);
    const membership = await db.organizationMembership.findFirst({ where: { organizationId: organization.id, accountId: actorId, enabled: true } });
    if (!membership) throw fail(403, "Active organization membership is required.");
    if (!allowSetup) requireOrganizationProfile(organization);
    const permissions = effective(membership, organization);
    if (manage) { if (!account.emailVerifiedAt || !permissions.includes(MANAGE)) throw fail(403, "Staff-management permission is required."); await assertMfaSession(db, actorId, sessionId, now()); }
    return { membership, permissions };
  }
  async function audit(db, organizationId, actorId, action, entityId, data) { await db.organizationStaffAudit.create({ data: { organizationId, actorId, action, entityId, data } }); }
  async function bump(db, organization, expected) {
    if (organization.staffVersion !== expected || (await db.organization.updateMany({ where: { id: organization.id, staffVersion: expected }, data: { staffVersion: { increment: 1 } } })).count !== 1) throw conflict();
  }
  function grantable(permissions, actor, organization) { if (!permissions.every(p => catalog(organization).includes(p) && actor.permissions.includes(p))) throw fail(403, "You cannot grant permissions you do not hold or capabilities this organization does not have."); }
  const summary = o => ({ id: o.id, name: o.name, type: o.type, offersTraining: o.offersTraining });
  async function invitation(db, id) { const r = await db.organizationInvitation.findUnique({ where: { id } }); if (!r) throw fail(404, "Invitation not found."); return r; }
  function projectInvitation(r, username) { return { id: r.id, username, permissions: r.permissions, permissionLabels: r.permissions.map(key => PERMISSIONS[key]), state: r.state === "PENDING" && r.expiresAt <= now() ? "EXPIRED" : r.state, version: r.version, expiresAt: r.expiresAt }; }
  async function invitationView(db, r) { const recipient = await db.account.findUnique({ where: { id: r.recipientId }, select: { username: true } }); return projectInvitation(r, recipient?.username); }
  async function page(db, model, where, cursor, scope, direction = "desc") {
    if (cursor) { const anchor = await db[model].findUnique({ where: { id: cursor } }); if (!anchor || Object.entries(scope).some(([k, v]) => anchor[k] !== v)) throw fail(404, "Page is unavailable."); }
    return db[model].findMany({ where, orderBy: [{ createdAt: direction }, { id: direction }], ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 21 });
  }
  const service = {
    async directory(actorId, sessionId, supplied = {}) {
      const { tab, search, cursor } = parse(workspaceDirectorySchema, supplied);
      return transaction(async db => {
        await live(db, actorId, sessionId);
        const name = search ? { contains: search, mode: "insensitive" } : undefined;
        const organization = { status: "ACTIVE", request: { status: "APPROVED" }, ...(name ? { name } : {}) };
        const requestBase = { applicantId: actorId, ...(name ? { name } : {}) };
        const scopes = {
          approved: ["organizationMembership", { accountId: actorId, enabled: true, organization }],
          pending: ["organizationRequest", { ...requestBase, status: { in: ["SUBMITTED", "ASSIGNED", "RECOMMENDED"] } }],
          invitations: ["organizationInvitation", { recipientId: actorId, state: "PENDING", expiresAt: { gt: now() }, organization }],
          history: ["organizationRequest", { ...requestBase, status: { in: ["REJECTED", "ABORTED"] } }],
        };
        const counts = {};
        for (const [key, [model, where]] of Object.entries(scopes)) counts[key] = await db[model].count({ where });
        const [model, where] = scopes[tab];
        if (cursor && !await db[model].findFirst({ where: { ...where, id: cursor }, select: { id: true } })) throw fail(409, "This workspace list changed. Reload before continuing.");
        const organizationSelect = { id: true, name: true, type: true, offersTraining: true, username: true, profilePhotoId: true };
        const select = tab === "approved" ? { id: true, role: true, organization: { select: organizationSelect } }
          : tab === "invitations" ? { id: true, version: true, expiresAt: true, permissions: true, organization: { select: organizationSelect } }
          : { id: true, name: true, type: true, representativeRole: true, version: true, status: true, targetAt: true, decisionReason: true };
        const rows = await db[model].findMany({ where, select, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 21 });
        const publicSummary = organization => { const { profilePhotoId, ...fields } = organization; return { ...fields, photoId: profilePhotoId }; };
        const items = rows.slice(0, 20).map(row => tab === "approved" ? { ...publicSummary(row.organization), role: row.role }
          : tab === "invitations" ? { ...row, organization: publicSummary(row.organization), permissionLabels: row.permissions.map(key => PERMISSIONS[key]).filter(Boolean) }
          : { ...row, overdue: row.targetAt < now() });
        await live(db, actorId, sessionId);
        return { tab, search, counts, items, nextCursor: rows.length > 20 ? rows[19].id : null };
      });
    },
    async home(actorId, sessionId, supplied = {}) {
      const paging = parse(listStaffSchema, supplied);
      const account = await live(prisma, actorId, sessionId);
      const memberships = await page(prisma, "organizationMembership", { accountId: actorId, enabled: true }, paging.memberCursor, { accountId: actorId });
      const rows = await page(prisma, "organizationInvitation", { recipientId: actorId, state: "PENDING", expiresAt: { gt: now() } }, paging.inviteCursor, { recipientId: actorId });
      const ids = [...new Set([...memberships.slice(0, 20), ...rows.slice(0, 20)].map(r => r.organizationId))];
      const active = await prisma.organization.findMany({ where: { id: { in: ids }, status: "ACTIVE", request: { status: "APPROVED" } }, select: { id: true, name: true, type: true, offersTraining: true } });
      const byId = new Map(active.map(o => [o.id, o]));
      const organizations = memberships.slice(0, 20).filter(m => byId.has(m.organizationId)).map(m => ({ ...summary(byId.get(m.organizationId)), role: m.role }));
      const invitations = rows.slice(0, 20).filter(r => byId.has(r.organizationId)).map(r => ({ ...projectInvitation(r, account.username), organization: summary(byId.get(r.organizationId)) }));
      await live(prisma, actorId, sessionId);
      return { accountId: actorId, organizations, invitations, nextMemberCursor: memberships.length > 20 ? memberships[19].id : null, nextInviteCursor: rows.length > 20 ? rows[19].id : null };
    },
    async context(actorId, sessionId, id) {
      requestId(id); return transaction(async db => {
        await lock(db, [actorId]); const organization = await org(db, id, true), actor = await access(db, actorId, sessionId, organization, false, true);
        return { accountId: actorId, organization: summary(organization), membership: { id: actor.membership.id, role: actor.membership.role, version: actor.membership.version }, permissions: actor.permissions, setupRequired: !organizationProfileReady(organization), workspace: organizationProfileReady(organization) ? organizationWorkspace(organization, actor.permissions, actor.membership.role) : { available: [], planned: [], campusActive: false, campusSetup: null }, staffVersion: organization.staffVersion, permissionCatalog: catalog(organization).map(key => ({ key, label: PERMISSIONS[key] })) };
      });
    },
    async staff(actorId, sessionId, id, supplied = {}) {
      const paging = parse(listStaffSchema, supplied); requestId(id); return transaction(async db => {
        await lock(db, [actorId]); const organization = await org(db, id, true); await access(db, actorId, sessionId, organization, true);
        const members = await page(db, "organizationMembership", { organizationId: id }, paging.memberCursor, { organizationId: id }, "asc");
        const invitations = await page(db, "organizationInvitation", { organizationId: id, state: "PENDING" }, paging.inviteCursor, { organizationId: id });
        const ids = [...new Set([...members.slice(0, 20).map(m => m.accountId), ...invitations.slice(0, 20).map(r => r.recipientId)])];
        const users = await db.account.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } }), byId = new Map(users.map(a => [a.id, a.username]));
        const projected = members.slice(0, 20).map(m => ({ id: m.id, username: byId.get(m.accountId), role: m.role, enabled: m.enabled, version: m.version, permissions: effective(m, organization) }));
        return { staffVersion: organization.staffVersion, members: projected, invitations: invitations.slice(0, 20).map(r => projectInvitation(r, byId.get(r.recipientId))), nextMemberCursor: members.length > 20 ? members[19].id : null, nextInviteCursor: invitations.length > 20 ? invitations[19].id : null };
      });
    },
    async invite(actorId, sessionId, id, body) {
      requestId(id); const data = parse(inviteSchema, body), account = await live(prisma, actorId, sessionId);
      // Resolve recipients only after the authenticated actor's organization authority is checked.
      return transaction(async db => {
        await lock(db, [account.id]); const organization = await org(db, id, true), actor = await access(db, actorId, sessionId, organization, true);
        grantable(data.permissions, actor, organization);
        const inputHash = digest({ username: data.username, permissions: data.permissions });
        const prior = await db.organizationInvitation.findFirst({ where: { organizationId: id, senderId: actorId, idempotencyKey: data.idempotencyKey } });
        if (prior) { if (prior.inputHash !== inputHash) throw conflict(); return invitationView(db, prior); }
        const recipient = await db.account.findUnique({ where: { username: data.username }, select: { id: true } });
        if (!recipient || (await db.account.findUnique({ where: { id: recipient.id } }))?.status !== "ACTIVE") throw fail(400, "Choose an active BrightWay username.");
        if (recipient.id === actorId || await db.organizationMembership.findFirst({ where: { organizationId: id, accountId: recipient.id, enabled: true } })) throw fail(409, "This account is already an active member.");
        const previous = await db.organizationInvitation.findFirst({ where: { organizationId: id, recipientId: recipient.id, state: "PENDING" } });
        if (previous && previous.expiresAt > now()) throw fail(409, "An active invitation already exists for this account.");
        await bump(db, organization, data.expectedStaffVersion);
        if (previous) { await db.organizationInvitation.updateMany({ where: { id: previous.id, state: "PENDING", version: previous.version }, data: { state: "EXPIRED", version: { increment: 1 } } }); await audit(db, id, actorId, "INVITATION_EXPIRED", previous.id, {}); }
        if (await db.organizationInvitation.count({ where: { organizationId: id, createdAt: { gte: new Date(+now() - 86400000) } } }) >= 50) throw fail(429, "Organization invitation limit reached. Try later.");
        const r = await db.organizationInvitation.create({ data: { id: randomUUID(), organizationId: id, senderId: actorId, recipientId: recipient.id, permissions: data.permissions, idempotencyKey: data.idempotencyKey, inputHash, expiresAt: new Date(+now() + 7 * 86400000) } });
        await audit(db, id, actorId, "INVITED", r.id, { recipientId: recipient.id, permissions: data.permissions }); await access(db, actorId, sessionId, organization, true); return invitationView(db, r);
      });
    },
    async respond(actorId, sessionId, invitationId, body) {
      requestId(invitationId); const data = parse(respondInviteSchema, body); await live(prisma, actorId, sessionId); const known = await invitation(prisma, invitationId);
      if (known.recipientId !== actorId) throw fail(404, "Invitation not found.");
      return transaction(async db => {
        await lock(db, [actorId, ...(data.decision === "ACCEPT" ? [known.senderId] : [])]); const organization = await org(db, known.organizationId, true); if (data.decision === "ACCEPT") requireOrganizationProfile(organization); await live(db, actorId, sessionId); const r = await invitation(db, invitationId);
        if (r.recipientId !== actorId || r.version !== data.expectedVersion || r.state !== "PENDING" || r.expiresAt <= now()) throw conflict();
        if (data.decision === "ACCEPT") {
          const sender = await db.account.findUnique({ where: { id: r.senderId } }), membership = await db.organizationMembership.findFirst({ where: { organizationId: organization.id, accountId: r.senderId, enabled: true } });
          const scope = effective(membership, organization);
          if (sender?.status !== "ACTIVE" || !sender.emailVerifiedAt || !scope.includes(MANAGE) || !r.permissions.every(p => scope.includes(p))) throw fail(409, "Invitation authority changed. Ask the organization for a new invitation.");
          const existing = await db.organizationMembership.findFirst({ where: { organizationId: organization.id, accountId: actorId } });
          if (existing?.enabled || existing?.role === "PRIMARY_ADMIN") throw conflict();
          if (existing) { if ((await db.organizationMembership.updateMany({ where: { id: existing.id, version: existing.version, enabled: false }, data: { enabled: true, permissions: r.permissions, version: { increment: 1 } } })).count !== 1) throw conflict(); }
          else await db.organizationMembership.create({ data: { organizationId: organization.id, accountId: actorId, role: "STAFF", permissions: r.permissions } });
        }
        const state = data.decision === "ACCEPT" ? "ACCEPTED" : "DECLINED";
        if ((await db.organizationInvitation.updateMany({ where: { id: invitationId, recipientId: actorId, state: "PENDING", version: data.expectedVersion, expiresAt: { gt: now() } }, data: { state, version: { increment: 1 }, respondedAt: now() } })).count !== 1) throw conflict();
        await bump(db, organization, organization.staffVersion); await audit(db, organization.id, actorId, `INVITATION_${state}`, invitationId, { permissions: r.permissions }); await live(db, actorId, sessionId); return { id: invitationId, state };
      });
    },
    async cancel(actorId, sessionId, id, invitationId, body) {
      requestId(id); requestId(invitationId); const data = parse(cancelInviteSchema, body);
      return transaction(async db => {
        await lock(db, [actorId]); const organization = await org(db, id, true); await access(db, actorId, sessionId, organization, true); const r = await invitation(db, invitationId);
        if (r.organizationId !== id) throw fail(404, "Invitation not found.");
        if (r.state !== "PENDING" || r.version !== data.expectedVersion) throw conflict();
        await bump(db, organization, data.expectedStaffVersion);
        if ((await db.organizationInvitation.updateMany({ where: { id: invitationId, organizationId: id, state: "PENDING", version: r.version }, data: { state: "CANCELLED", version: { increment: 1 } } })).count !== 1) throw conflict();
        await audit(db, id, actorId, "INVITATION_CANCELLED", invitationId, {}); await access(db, actorId, sessionId, organization, true); return { id: invitationId, state: "CANCELLED" };
      });
    },
    async change(actorId, sessionId, id, membershipId, body) {
      requestId(id); requestId(membershipId); const data = parse(changeMemberSchema, body);
      return transaction(async db => {
        await lock(db, [actorId]); const organization = await org(db, id, true), actor = await access(db, actorId, sessionId, organization, true);
        const target = await db.organizationMembership.findUnique({ where: { id: membershipId } });
        if (!target || target.organizationId !== id) throw fail(404, "Membership not found.");
        if (target.role === "PRIMARY_ADMIN") throw fail(409, "The primary administrator cannot be removed or changed here.");
        grantable(data.permissions, actor, organization);
        if (!effective(target, organization).every(p => actor.permissions.includes(p))) throw fail(403, "You cannot manage a member with permissions outside your own authority.");
        await bump(db, organization, data.expectedStaffVersion);
        if ((await db.organizationMembership.updateMany({ where: { id: membershipId, organizationId: id, version: data.expectedVersion }, data: { enabled: data.enabled, permissions: data.permissions, version: { increment: 1 } } })).count !== 1) throw conflict();
        await audit(db, id, actorId, "MEMBER_CHANGED", membershipId, { before: { enabled: target.enabled, permissions: target.permissions }, after: { enabled: data.enabled, permissions: data.permissions } });
        await live(db, actorId, sessionId); await assertMfaSession(db, actorId, sessionId, now()); return { id: membershipId, enabled: data.enabled, version: data.expectedVersion + 1 };
      });
    },
  }; return service;
}
