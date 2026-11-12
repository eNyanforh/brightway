import { createHash, randomUUID } from "node:crypto";
import { assertMfaSession } from "../auth/mfa.service.js";
import { requireOrganizationProfile } from "../organizations/organization-profile.schema.js";
import { announcementInput, announcementQuery, assessEligibility, campusError as fail, campusId, campusParse, settingsInput, setupInput, transitionInput, withdrawalInput } from "./campus.schema.js";

const MANAGE = "organization.campus.manage";
const ANNOUNCE = "organization.campus.announcements.manage";
const ACADEMICS = "organization.campus.academics.manage";
const BILLING = "organization.campus.billing.manage";
const TEACH = "organization.campus.teach";
const hash = input => createHash("sha256").update(JSON.stringify(input)).digest("hex");
const conflict = () => fail(409, "Campus changed. Reload its current version before continuing.");

export function createCampusService({ prisma, now = () => new Date() }) {
  async function transaction(fn) {
    try { return await prisma.$transaction(fn); }
    catch (error) { if (["P2002", "P2034"].includes(error.code)) throw conflict(); throw error; }
  }
  async function access(db, actor, organizationId, { write = false, primary = false, requireActive = false, capability = null, lock = false } = {}) {
    campusId(organizationId);
    if (!actor?.accountId || !actor?.sessionId) throw fail(401, "Please sign in again.");
    if (lock && (await db.account.updateMany({ where: { id: actor.accountId, status: "ACTIVE" }, data: { identityRevision: { increment: 0 } } })).count !== 1) throw fail(401, "Please sign in again.");
    const account = await db.account.findUnique({ where: { id: actor.accountId }, select: { id: true, status: true, emailVerifiedAt: true } });
    const session = await db.session.findFirst({ where: { id: actor.sessionId, accountId: actor.accountId, expiresAt: { gt: now() } } });
    if (account?.status !== "ACTIVE" || !session) throw fail(401, "Please sign in again.");
    let organization = await db.organization.findFirst({ where: { id: organizationId, status: "ACTIVE", request: { status: "APPROVED" } },
      include: { locations: true, request: { select: { status: true } }, campus: true } });
    if (!organization) throw fail(404, "Organization workspace is unavailable.");
    if (lock && (await db.organization.updateMany({ where: { id: organizationId, status: "ACTIVE" }, data: { staffVersion: { increment: 0 } } })).count !== 1) throw conflict();
    // Read current Campus status after waiting for a concurrent pause/staff change.
    if (lock) {
      organization = await db.organization.findFirst({ where: { id: organizationId, status: "ACTIVE", request: { status: "APPROVED" } },
        include: { locations: true, request: { select: { status: true } }, campus: true } });
      if (!organization) throw fail(404, "Organization workspace is unavailable.");
    }
    const membership = await db.organizationMembership.findFirst({ where: { organizationId, accountId: actor.accountId, enabled: true } });
    if (!membership) throw fail(403, "Active organization membership is required.");
    const product = await db.productAvailability.findUnique({ where: { product_countryCode: { product: "VIRTUAL_CAMPUS", countryCode: "LR" } } });
    const eligibility = assessEligibility(organization, product);
    const isPrimary = membership.role === "PRIMARY_ADMIN";
    const active = organization.campus?.status === "ACTIVE" && eligibility.eligible && eligibility.supportedEngines.includes(organization.campus.engine);
    const grants = isPrimary && active ? [MANAGE, ANNOUNCE, ACADEMICS, BILLING, TEACH]
      : active ? (membership.permissions || []).filter(key => [MANAGE, ANNOUNCE, ACADEMICS, BILLING, TEACH].includes(key)) : [];
    if (primary && !isPrimary) throw fail(403, "Only the primary organization administrator can change Campus activation.");
    if (write) {
      if (!account.emailVerifiedAt) throw fail(403, "Verify your account email before managing Campus.");
      requireOrganizationProfile(organization);
      await assertMfaSession(db, actor.accountId, actor.sessionId, now());
    }
    if (capability && !grants.includes(capability)) throw fail(403, "Your account does not have this Campus permission.");
    if (requireActive && !active) throw fail(409, "Virtual Campus is not active and eligible. Academic and billing access remains disabled.");
    return { organization, membership, eligibility, isPrimary, active, grants };
  }
  const summary = ctx => ({
    organizationId: ctx.organization.id, eligible: ctx.eligibility.eligible, eligibility: ctx.eligibility,
    campus: ctx.organization.campus ? {
      engine: ctx.organization.campus.engine,
      status: !ctx.active && ctx.organization.campus.status === "ACTIVE" ? "BLOCKED" : ctx.organization.campus.status,
      storedStatus: ctx.organization.campus.status,
      version: ctx.organization.campus.version, displayName: ctx.organization.campus.displayName,
      contactEmail: ctx.organization.campus.contactEmail, activatedAt: ctx.organization.campus.activatedAt,
    } : null,
    permissions: ctx.grants, canSetup: ctx.isPrimary && ctx.eligibility.eligible,
    canManage: ctx.isPrimary || ctx.grants.includes(MANAGE),
    canAnnounce: ctx.active && (ctx.isPrimary || ctx.grants.includes(ANNOUNCE) || ctx.grants.includes(MANAGE)),
  });
  async function audit(db, ctx, action, data) {
    await db.virtualCampusAudit.create({ data: { campusId: ctx.organization.id, actorId: ctx.membership.accountId, action, data } });
  }
  async function changeStatus(actor, organizationId, body, action) {
    const { expectedVersion } = campusParse(transitionInput, body);
    return transaction(async db => {
      const ctx = await access(db, actor, organizationId, { write: true, lock: true, primary: true });
      const campus = ctx.organization.campus;
      if (!campus) throw fail(409, "Complete Campus setup before activating.");
      const current = action === "ACTIVATE" ? "SETUP" : action === "PAUSE" ? "ACTIVE" : "PAUSED";
      const next = action === "PAUSE" ? "PAUSED" : "ACTIVE";
      if (campus.version !== expectedVersion || campus.status !== current) throw conflict();
      if (next === "ACTIVE" && !ctx.eligibility.eligible) throw fail(403, "A verified Liberian operation and available product are required to activate Campus.");
      if (action === "ACTIVATE" && (!campus.displayName || !ctx.eligibility.supportedEngines.includes(campus.engine))) throw fail(409, "Finish an eligible Campus configuration first.");
      const updated = await db.virtualCampus.updateMany({
        where: { organizationId, version: expectedVersion, status: current },
        data: { status: next, version: { increment: 1 }, ...(action === "ACTIVATE" ? { activatedAt: now() } : {}) },
      });
      if (updated.count !== 1) throw conflict();
      await audit(db, ctx, action, { engine: campus.engine, from: current, to: next, version: expectedVersion + 1 });
      return { organizationId, status: next, version: expectedVersion + 1 };
    });
  }
  async function announcementAccess(db, actor, organizationId, { write = false, lock = false } = {}) {
    const ctx = await access(db, actor, organizationId, { write, lock, requireActive: true });
    if (!ctx.isPrimary && !ctx.grants.some(p => [MANAGE, ANNOUNCE, ACADEMICS, BILLING, TEACH].includes(p))) throw fail(403, "Campus access is not granted to your account.");
    if (write && !ctx.isPrimary && !ctx.grants.some(p => [MANAGE, ANNOUNCE].includes(p))) throw fail(403, "Campus announcement permission is required.");
    return ctx;
  }
  const projectAnnouncement = item => ({ id: item.id, title: item.title, body: item.body, authorId: item.authorId, audience: item.audience || "STAFF",
    version: item.version, createdAt: item.createdAt, withdrawnAt: item.withdrawnAt });
  return {
    // Internal service boundary, never exposed as an HTTP response.
    authorize: access,
    async availability(actor, organizationId) {
      const ctx = await access(prisma, actor, organizationId);
      return summary(ctx);
    },
    async setup(actor, organizationId, input) {
      const data = campusParse(setupInput, input);
      return transaction(async db => {
        const ctx = await access(db, actor, organizationId, { write: true, primary: true, lock: true });
        if (!ctx.eligibility.eligible || !ctx.eligibility.supportedEngines.includes(data.engine)) throw fail(403, "This organization is not eligible for the selected Campus engine.");
        const previous = ctx.organization.campus;
        if (previous?.status !== undefined && previous.status !== "SETUP") throw fail(409, "An activated Campus engine cannot be replaced.");
        if ((previous?.version ?? 0) !== data.expectedVersion) throw conflict();
        if (previous) {
          if ((await db.virtualCampus.updateMany({ where: { organizationId, version: data.expectedVersion, status: "SETUP" }, data: {
            engine: data.engine, displayName: data.displayName, contactEmail: data.contactEmail, version: { increment: 1 },
          } })).count !== 1) throw conflict();
        } else {
          await db.virtualCampus.create({ data: { organizationId, engine: data.engine, displayName: data.displayName, contactEmail: data.contactEmail } });
        }
        await audit(db, ctx, previous ? "SETUP_UPDATED" : "SETUP_CREATED", { engine: data.engine, version: data.expectedVersion + 1 });
        return { organizationId, status: "SETUP", version: data.expectedVersion + 1, engine: data.engine };
      });
    },
    async activate(actor, organizationId, body) { return changeStatus(actor, organizationId, body, "ACTIVATE"); },
    async pause(actor, organizationId, body) { return changeStatus(actor, organizationId, body, "PAUSE"); },
    async resume(actor, organizationId, body) { return changeStatus(actor, organizationId, body, "RESUME"); },
    async settings(actor, organizationId, input) {
      const data = campusParse(settingsInput, input);
      return transaction(async db => {
        const ctx = await access(db, actor, organizationId, { write: true, lock: true });
        if (!ctx.isPrimary && !ctx.grants.includes(MANAGE)) throw fail(403, "Campus settings permission is required.");
        const campus = ctx.organization.campus;
        if (!campus || campus.version !== data.expectedVersion) throw conflict();
        if ((await db.virtualCampus.updateMany({ where: { organizationId, version: data.expectedVersion }, data: {
          displayName: data.displayName, contactEmail: data.contactEmail, version: { increment: 1 },
        } })).count !== 1) throw conflict();
        await audit(db, ctx, "SETTINGS_UPDATED", { version: data.expectedVersion + 1 });
        return { organizationId, version: data.expectedVersion + 1 };
      });
    },
    async announcements(actor, organizationId, supplied = {}) {
      const { cursor } = campusParse(announcementQuery, supplied);
      const ctx = await announcementAccess(prisma, actor, organizationId);
      if (cursor && !await prisma.campusAnnouncement.findFirst({ where: { id: cursor, campusId: organizationId, withdrawnAt: null } })) throw fail(404, "Announcement page is unavailable.");
      const rows = await prisma.campusAnnouncement.findMany({
        where: { campusId: organizationId, withdrawnAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 21,
      });
      await announcementAccess(prisma, actor, organizationId);
      return { organizationId: ctx.organization.id, items: rows.slice(0, 20).map(projectAnnouncement),
        nextCursor: rows.length > 20 ? rows[19].id : null };
    },
    async publish(actor, organizationId, input) {
      const data = campusParse(announcementInput, input);
      return transaction(async db => {
        const ctx = await announcementAccess(db, actor, organizationId, { write: true, lock: true });
        const inputHash = hash({ title: data.title, body: data.body, audience: data.audience });
        const unique = { campusId_authorId_requestKey: { campusId: organizationId, authorId: actor.accountId, requestKey: data.requestKey } };
        const previous = await db.campusAnnouncement.findUnique({ where: unique });
        if (previous) {
          if (previous.inputHash !== inputHash && !(data.audience === "STAFF" && previous.audience === "STAFF" && previous.inputHash === hash({ title: data.title, body: data.body }))) throw conflict();
          return projectAnnouncement(previous);
        }
        const row = await db.campusAnnouncement.create({ data: {
          id: randomUUID(), campusId: organizationId, authorId: actor.accountId,
          requestKey: data.requestKey, inputHash, title: data.title, body: data.body, audience: data.audience,
        } });
        await audit(db, ctx, "ANNOUNCEMENT_PUBLISHED", { announcementId: row.id, audience: data.audience });
        const members = await db.organizationMembership.findMany({
          where: { organizationId, enabled: true }, select: { accountId: true, role: true, permissions: true },
        });
        const staffIds = members.filter(member => member.accountId !== actor.accountId &&
          (member.role === "PRIMARY_ADMIN" || member.permissions.some(p => [MANAGE, ANNOUNCE, ACADEMICS, BILLING, TEACH].includes(p)))).map(member => member.accountId);
        const recipients = staffIds.map(recipientId => ({ recipientId, href: "/organization-workspace/" + organizationId + "/campus" }));
        if (data.audience === "CAMPUS" && ctx.organization.campus.engine === "GRADE_SCHOOL") {
          const learners = await db.gradeSchoolStudent.findMany({ where: { campusId: organizationId, status: "ACTIVE", account: { status: "ACTIVE" }, registrations: { some: { status: "ACTIVE" } } }, select: { accountId: true } });
          for (const learner of learners) if (learner.accountId !== actor.accountId && !staffIds.includes(learner.accountId)) recipients.push({ recipientId: learner.accountId, href: "/learning?view=campus" });
        }
        if (data.audience === "CAMPUS" && ctx.organization.campus.engine === "TVET") {
          const learners = await db.tvetLearner.findMany({ where: { campusId: organizationId, status: "ACTIVE", account: { status: "ACTIVE" }, enrolments: { some: { status: "ACTIVE" } } }, select: { accountId: true } });
          for (const learner of learners) if (learner.accountId !== actor.accountId && !staffIds.includes(learner.accountId)) recipients.push({ recipientId: learner.accountId, href: "/learning?view=campus" });
        }
        // Legacy announcements default to STAFF. Only explicitly campus-wide
        // announcements can notify officially active, enrolled learners.
        for (let offset = 0; offset < recipients.length; offset += 200) {
          await db.platformNotification.createMany({
            data: recipients.slice(offset, offset + 200).map(recipient => ({
              recipientId: recipient.recipientId, eventKey: "campus:" + organizationId + ":announcement:" + row.id,
              kind: "CAMPUS", title: "New Campus announcement: " + row.title.slice(0, 150),
              href: recipient.href, actorAccountId: actor.accountId,
            })), skipDuplicates: true,
          });
        }
        return projectAnnouncement(row);
      });
    },
    async withdraw(actor, organizationId, announcementId, input) {
      campusId(announcementId);
      const { expectedVersion } = campusParse(withdrawalInput, input);
      return transaction(async db => {
        const ctx = await announcementAccess(db, actor, organizationId, { write: true, lock: true });
        const previous = await db.campusAnnouncement.findUnique({ where: { id: announcementId } });
        if (!previous || previous.campusId !== organizationId) throw fail(404, "Announcement not found.");
        if (previous.withdrawnAt || previous.version !== expectedVersion) throw conflict();
        if ((await db.campusAnnouncement.updateMany({
          where: { id: announcementId, campusId: organizationId, version: expectedVersion, withdrawnAt: null },
          data: { withdrawnAt: now(), version: { increment: 1 } },
        })).count !== 1) throw conflict();
        await audit(db, ctx, "ANNOUNCEMENT_WITHDRAWN", { announcementId, version: expectedVersion + 1 });
        return { id: announcementId, withdrawn: true, version: expectedVersion + 1 };
      });
    },
    async assertAcademic(actor, organizationId) {
      const ctx = await access(prisma, actor, organizationId, { requireActive: true, capability: ACADEMICS });
      return { organizationId, engine: ctx.organization.campus.engine };
    },
    async assertBilling(actor, organizationId) {
      const ctx = await access(prisma, actor, organizationId, { requireActive: true, capability: BILLING });
      return { organizationId, engine: ctx.organization.campus.engine };
    },
  };
}
