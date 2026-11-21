import { campusMemberPermissions, scopePermissions } from "./campus-permissions.js";
import { onboardingInput, onboardingCompleteInput, enableEngineInput, engineConfigurationInput, permissionGrantInput } from "./campus.schema.js";
import { createHash, randomUUID } from "node:crypto";
import { assertMfaSession } from "../auth/mfa.service.js";
import { requireOrganizationProfile } from "../organizations/organization-profile.schema.js";
import { announcementInput, announcementQuery, assessEligibility, configuredEngines, enginesEligible, campusError as fail, campusId, campusParse, settingsInput, setupInput, transitionInput, withdrawalInput } from "./campus.schema.js";

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
  async function access(db, actor, organizationId, { write = false, primary = false, requireActive = false, capability = null, lock = false, scope = "CAMPUS" } = {}) {
    campusId(organizationId);
    if (!actor?.accountId || !actor?.sessionId) throw fail(401, "Please sign in again.");
    if (lock && (await db.account.updateMany({ where: { id: actor.accountId, status: "ACTIVE" }, data: { identityRevision: { increment: 0 } } })).count !== 1) throw fail(401, "Please sign in again.");
    const account = await db.account.findUnique({ where: { id: actor.accountId }, select: { id: true, status: true, emailVerifiedAt: true } });
    const session = await db.session.findFirst({ where: { id: actor.sessionId, accountId: actor.accountId, expiresAt: { gt: now() } } });
    if (account?.status !== "ACTIVE" || !session) throw fail(401, "Please sign in again.");
    let organization = await db.organization.findFirst({ where: { id: organizationId, status: "ACTIVE", request: { status: "APPROVED" } },
      include: { locations: true, request: { select: { status: true } }, campus: { include: { engineConfigurations: { orderBy: { engine: "asc" } } } } } });
    if (!organization) throw fail(404, "Organization workspace is unavailable.");
    if (lock && (await db.organization.updateMany({ where: { id: organizationId, status: "ACTIVE" }, data: { staffVersion: { increment: 0 } } })).count !== 1) throw conflict();
    // Read current Campus status after waiting for a concurrent pause/staff change.
    if (lock) {
      organization = await db.organization.findFirst({ where: { id: organizationId, status: "ACTIVE", request: { status: "APPROVED" } },
        include: { locations: true, request: { select: { status: true } }, campus: { include: { engineConfigurations: { orderBy: { engine: "asc" } } } } } });
      if (!organization) throw fail(404, "Organization workspace is unavailable.");
    }
    const membership = await db.organizationMembership.findFirst({ where: { organizationId, accountId: actor.accountId, enabled: true } });
    if (!membership) throw fail(403, "Active organization membership is required.");
    const product = await db.productAvailability.findUnique({ where: { product_countryCode: { product: "VIRTUAL_CAMPUS", countryCode: "LR" } } });
    const eligibility = assessEligibility(organization, product);
    const isPrimary = membership.role === "PRIMARY_ADMIN";
    const active = organization.campus?.status === "ACTIVE" && eligibility.eligible && enginesEligible(organization.campus, eligibility) && organization.campus.configurationStatus === "READY";
    const grants = active ? await campusMemberPermissions(db, organization.campus, membership, scope) : [];
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
      engine: ctx.organization.campus.engine, enabledEngines: configuredEngines(ctx.organization.campus),
      status: !ctx.active && ctx.organization.campus.status === "ACTIVE" ? "BLOCKED" : ctx.organization.campus.status,
      storedStatus: ctx.organization.campus.status,
      configurationStatus: ctx.organization.campus.configurationStatus,
      engineConfigurations: ctx.organization.campus.engineConfigurations,
      version: ctx.organization.campus.version, displayName: ctx.organization.campus.displayName,
      contactEmail: ctx.organization.campus.contactEmail, activatedAt: ctx.organization.campus.activatedAt,
    } : null,
    permissions: ctx.grants, canSetup: ctx.isPrimary && ctx.eligibility.eligible && (!ctx.organization.campus || ctx.organization.campus.status === "SETUP"),
    canManage: ctx.isPrimary || ctx.grants.includes(MANAGE),
    canAnnounce: ctx.active && (ctx.isPrimary || ctx.grants.includes(ANNOUNCE) || ctx.grants.includes(MANAGE)),
  });
  async function audit(db, ctx, action, data) {
    await db.virtualCampusAudit.create({ data: { campusId: ctx.organization.id, actorId: ctx.membership.accountId, action, data, ...(["SETUP_CREATED", "SETUP_UPDATED", "ACTIVATE", "PAUSE", "RESUME", "SETTINGS_UPDATED", "ENGINE_ENABLED", "ENGINE_CONFIGURED", "PERMISSION_CHANGED"].includes(action) ? { campusVersion: data.version } : {}) } });
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
      if (next === "ACTIVE" && (!campus.displayName || campus.configurationStatus !== "READY" || !enginesEligible(campus, ctx.eligibility))) throw fail(409, "Finish an eligible Campus configuration first.");
      const updated = await db.virtualCampus.updateMany({
        where: { organizationId, version: expectedVersion, status: current },
        data: { status: next, version: { increment: 1 }, ...(action === "ACTIVATE" ? { activatedAt: now() } : {}) },
      });
      if (updated.count !== 1) throw conflict();
      await audit(db, ctx, action, { engine: campus.engine, enabledEngines: configuredEngines(campus), from: current, to: next, version: expectedVersion + 1 });
      return { organizationId, status: next, version: expectedVersion + 1, enabledEngines: configuredEngines(campus) };
    });
  }
  async function announcementAccess(db, actor, organizationId, { write = false, lock = false } = {}) {
    const ctx = await access(db, actor, organizationId, { write, lock, requireActive: true });
    if (!ctx.isPrimary && !ctx.grants.length) {
      let academicAccess = false;
      for (const engine of configuredEngines(ctx.organization.campus)) if ((await campusMemberPermissions(db, ctx.organization.campus, ctx.membership, engine)).length) academicAccess = true;
      if (!academicAccess) throw fail(403, "Campus access is not granted to your account.");
    }
    if (write && !ctx.isPrimary && !ctx.grants.some(p => [MANAGE, ANNOUNCE].includes(p))) throw fail(403, "Campus announcement permission is required.");
    return ctx;
  }
  const projectAnnouncement = item => ({ id: item.id, title: item.title, body: item.body, authorId: item.authorId, audience: item.audience || "STAFF",
    version: item.version, createdAt: item.createdAt, withdrawnAt: item.withdrawnAt });
  return {
    async onboarding(actor, organizationId) {
      const ctx = await access(prisma, actor, organizationId, { primary: true });
      const draft = await prisma.campusOnboarding.findUnique({ where: { organizationId } });
      const member = await prisma.account.findUnique({ where: { id: actor.accountId }, select: { username: true } });
      return { ...summary(ctx), organizationName: ctx.organization.name,
        administrator: { membershipId: ctx.membership.id, username: member.username },
        draft: draft || { step: 1, displayName: ctx.organization.campus?.displayName || ctx.organization.name, enabledEngines: configuredEngines(ctx.organization.campus), version: 0 } };
    },
    async saveOnboarding(actor, organizationId, input) {
      const data = campusParse(onboardingInput, input);
      const inputHash = hash(data);
      return transaction(async db => {
        const ctx = await access(db, actor, organizationId, { primary: true, write: true, lock: true });
        if (!ctx.eligibility.eligible) throw fail(403, ctx.eligibility.reasons.join(" "));
        if (ctx.organization.campus && ctx.organization.campus.status !== "SETUP") throw fail(409, "This Campus already exists. Open its workspace.");
        const previous = await db.campusOnboarding.findUnique({ where: { organizationId } });
        if (previous?.requestKey === data.requestKey) {
          if (previous.inputHash !== inputHash) throw conflict();
          return previous;
        }
        if ((previous?.version || 0) !== data.expectedVersion || data.step > (previous?.step || 1) + 1) throw conflict();
        if (data.step >= 3 && !data.displayName) throw fail(400, "Enter a Campus display name.");
        if (data.step === 4 && !data.enabledEngines.length) throw fail(400, "Select at least one academic engine.");
        const values = { step: data.step, displayName: data.displayName, enabledEngines: data.enabledEngines, requestKey: data.requestKey, inputHash };
        return previous ? db.campusOnboarding.update({ where: { organizationId }, data: { ...values, version: { increment: 1 } } })
          : db.campusOnboarding.create({ data: { organizationId, ...values } });
      });
    },
    async completeOnboarding(actor, organizationId, input) {
      const data = campusParse(onboardingCompleteInput, input);
      return transaction(async db => {
        const ctx = await access(db, actor, organizationId, { primary: true, write: true, lock: true });
        if (!ctx.eligibility.eligible) throw fail(403, ctx.eligibility.reasons.join(" "));
        if (data.administratorMembershipId !== ctx.membership.id) throw fail(403, "Confirm the current primary administrator.");
        const current = ctx.organization.campus;
        const workspacePath = `/campus/${organizationId}`;
        // Recover a lost successful response without replaying activation or audit.
        if (ctx.active) return { workspacePath, version: current.version };
        if (current && current.status !== "SETUP") throw fail(409, "This Campus is paused or unavailable. Restore access from its workspace.");
        const draft = await db.campusOnboarding.findUnique({ where: { organizationId } });
        if (!draft || draft.version !== data.expectedVersion || draft.step !== 4) throw conflict();
        if (!draft.displayName || !draft.enabledEngines.length) throw fail(400, "Complete Campus identity and academic engine selection.");
        const engines = ["GRADE_SCHOOL", "TVET"].filter(e => draft.enabledEngines.includes(e));
        if (current && configuredEngines(current).some(e => !engines.includes(e))) throw fail(409, "Existing academic engines must be retained.");
        let version = current?.version || 0;
        if (!current) {
          await db.virtualCampus.create({ data: { organizationId, engine: engines[0], enabledEngines: engines, displayName: draft.displayName, configurationStatus: "READY" } });
          await db.campusEngineConfiguration.createMany({ data: engines.map(engine => ({ campusId: organizationId, engine })) });
          await audit(db, ctx, "SETUP_CREATED", { version: ++version, enabledEngines: engines });
        } else {
          const added = engines.filter(e => !configuredEngines(current).includes(e));
          await db.campusEngineConfiguration.createMany({ data: added.map(engine => ({ campusId: organizationId, engine })) });
          await db.virtualCampus.update({ where: { organizationId }, data: { enabledEngines: engines, displayName: draft.displayName, configurationStatus: "READY", version: { increment: 1 } } });
          await audit(db, ctx, added.length ? "ENGINE_ENABLED" : "SETUP_UPDATED", { version: ++version, enabledEngines: engines, added });
        }
        await db.virtualCampus.update({ where: { organizationId }, data: { status: "ACTIVE", activatedAt: now(), version: { increment: 1 } } });
        await audit(db, ctx, "ACTIVATE", { version: ++version, enabledEngines: engines, administratorMembershipId: ctx.membership.id });
        await db.campusOnboarding.update({ where: { organizationId }, data: { completedAt: now() } });
        return { workspacePath, version };
      });
    },
    // Internal service boundary, never exposed as an HTTP response.
    authorize: access,
    async availability(actor, organizationId) {
      const ctx = await access(prisma, actor, organizationId);
      const enginePermissions = {};
      if (ctx.active) for (const engine of configuredEngines(ctx.organization.campus)) enginePermissions[engine] = await campusMemberPermissions(prisma, ctx.organization.campus, ctx.membership, engine);
      await access(prisma, actor, organizationId);
      return { ...summary(ctx), enginePermissions };
    },
    async setup(actor, organizationId, input) {
      const data = campusParse(setupInput, input);
      return transaction(async db => {
        const ctx = await access(db, actor, organizationId, { write: true, primary: true, lock: true });
        if (!ctx.eligibility.eligible || !enginesEligible(data, ctx.eligibility)) throw fail(403, "This organization is not eligible for the selected Campus engine.");
        const previous = ctx.organization.campus;
        if (previous?.status !== undefined && previous.status !== "SETUP") throw fail(409, "An activated Campus engine configuration cannot be replaced.");
        if ((previous?.version ?? 0) !== data.expectedVersion) throw conflict();
        if (previous && JSON.stringify(configuredEngines(previous)) !== JSON.stringify(data.enabledEngines)) throw fail(409, "Use the additional-engine operation; existing engines cannot be removed or replaced.");
        if (previous) {
          if ((await db.virtualCampus.updateMany({ where: { organizationId, version: data.expectedVersion, status: "SETUP" }, data: {
            configurationStatus: "READY", displayName: data.displayName, contactEmail: data.contactEmail, version: { increment: 1 },
          } })).count !== 1) throw conflict();
        } else {
          await db.virtualCampus.create({ data: { organizationId, configurationStatus: "READY", engine: data.engine, enabledEngines: data.enabledEngines, displayName: data.displayName, contactEmail: data.contactEmail } });
          await db.campusEngineConfiguration.createMany({ data: data.enabledEngines.map(engine => ({ campusId: organizationId, engine })) });
        }
        await audit(db, ctx, previous ? "SETUP_UPDATED" : "SETUP_CREATED", { engine: previous?.engine || data.engine, enabledEngines: data.enabledEngines, version: data.expectedVersion + 1 });
        return { organizationId, status: "SETUP", version: data.expectedVersion + 1, engine: previous?.engine || data.engine, enabledEngines: data.enabledEngines };
      });
    },
    async enableEngine(actor, organizationId, input) {
      const data = campusParse(enableEngineInput, input);
      return transaction(async db => {
        const ctx = await access(db, actor, organizationId, { write: true, primary: true, lock: true });
        const current = ctx.organization.campus;
        if (!current || current.version !== data.expectedVersion) throw conflict();
        if (!ctx.eligibility.eligible || !ctx.eligibility.supportedEngines.includes(data.engine)) throw fail(403, "This organization is not eligible for that academic engine.");
        const previous = configuredEngines(current);
        if (previous.includes(data.engine)) return { organizationId, enabledEngines: previous, version: current.version };
        const enabledEngines = ["GRADE_SCHOOL", "TVET"].filter(engine => previous.includes(engine) || engine === data.engine);
        await db.campusEngineConfiguration.create({ data: { campusId: organizationId, engine: data.engine } });
        if ((await db.virtualCampus.updateMany({ where: { organizationId, version: data.expectedVersion }, data: { enabledEngines, version: { increment: 1 } } })).count !== 1) throw conflict();
        await audit(db, ctx, "ENGINE_ENABLED", { engine: data.engine, previousEngines: previous, enabledEngines, version: current.version + 1 });
        return { organizationId, enabledEngines, version: current.version + 1 };
      });
    },
    async configureEngine(actor, organizationId, engine, input) {
      if (!["GRADE_SCHOOL", "TVET"].includes(engine)) throw fail(404, "Academic engine is unavailable.");
      const data = campusParse(engineConfigurationInput, input);
      return transaction(async db => {
        const ctx = await access(db, actor, organizationId, { write: true, lock: true, requireActive: true, capability: ACADEMICS, scope: engine });
        const current = ctx.organization.campus;
        const configuration = await db.campusEngineConfiguration.findUnique({ where: { campusId_engine: { campusId: organizationId, engine } } });
        if (!configuration || current.version !== data.expectedVersion || configuration.version !== data.expectedEngineVersion) throw conflict();
        if (data.status === "READY") {
          // Confirm the architecture's minimum setup chain; detailed academic
          // validation remains in the independent Grade School/TVET services.
          const assignment = engine === "GRADE_SCHOOL"
            ? await db.gradeSchoolOffering.findFirst({ where: { campusId: organizationId, teacher: { status: "ACTIVE" } }, select: { teacherId: true } })
            : await db.tvetAssignment.findFirst({ where: { campusId: organizationId, instructor: { status: "ACTIVE" }, intake: { sections: { some: {} } } }, select: { instructorId: true } });
          const teacherId = assignment?.teacherId || assignment?.instructorId;
          const member = teacherId && await db.organizationMembership.findFirst({ where: { organizationId, accountId: teacherId, enabled: true } });
          if (!member || !(await campusMemberPermissions(db, current, member, engine)).includes(TEACH)) throw fail(409, "Complete the academic structure and an authorized teaching assignment before marking this engine ready.");
        }
        const updated = await db.campusEngineConfiguration.update({ where: { campusId_engine: { campusId: organizationId, engine } }, data: { status: data.status, version: { increment: 1 } } });
        await db.virtualCampus.update({ where: { organizationId }, data: { version: { increment: 1 } } });
        await audit(db, ctx, "ENGINE_CONFIGURED", { engine, from: configuration.status, to: data.status, engineVersion: updated.version, version: current.version + 1 });
        return { organizationId, version: current.version + 1, configuration: updated };
      });
    },
    async permissionGrants(actor, organizationId) {
      const ctx = await access(prisma, actor, organizationId);
      if (!ctx.isPrimary && !ctx.grants.includes(MANAGE)) throw fail(403, "Campus administration permission is required.");
      const items = await prisma.campusPermissionGrant.findMany({ where: { campusId: organizationId }, orderBy: [{ membershipId: "asc" }, { scope: "asc" }, { permission: "asc" }] });
      const latest = await access(prisma, actor, organizationId);
      if (!latest.isPrimary && !latest.grants.includes(MANAGE)) throw fail(403, "Campus administration permission is required.");
      return { organizationId, items };
    },
    async setPermission(actor, organizationId, membershipId, input) {
      campusId(membershipId);
      const data = campusParse(permissionGrantInput, input);
      if (!scopePermissions[data.scope].includes(data.permission)) throw fail(400, "This permission does not belong to the selected scope.");
      return transaction(async db => {
        const ctx = await access(db, actor, organizationId, { write: true, lock: true, primary: true, requireActive: true });
        const current = ctx.organization.campus;
        if (current.version !== data.expectedVersion) throw conflict();
        if (data.scope !== "CAMPUS" && !configuredEngines(current).includes(data.scope)) throw fail(409, "Enable that academic engine before assigning its permissions.");
        const membership = await db.organizationMembership.findFirst({ where: { id: membershipId, organizationId } });
        if (!membership) throw fail(404, "Organization membership is unavailable.");
        if (data.enabled && !membership.enabled) throw fail(409, "Restore the organization membership before granting access.");
        const key = { campusId: organizationId, membershipId, scope: data.scope, permission: data.permission };
        const where = { campusId_membershipId_scope_permission: key };
        const previous = await db.campusPermissionGrant.findUnique({ where });
        if ((previous?.version || 0) !== data.expectedGrantVersion) throw conflict();
        const grant = previous
          ? await db.campusPermissionGrant.update({ where, data: { enabled: data.enabled, version: { increment: 1 } } })
          : await db.campusPermissionGrant.create({ data: { ...key, enabled: data.enabled } });
        await db.virtualCampus.update({ where: { organizationId }, data: { version: { increment: 1 } } });
        await audit(db, ctx, "PERMISSION_CHANGED", { membershipId, scope: data.scope, permission: data.permission, previousEnabled: previous?.enabled ?? null, enabled: data.enabled, grantVersion: grant.version, version: current.version + 1 });
        return { organizationId, version: current.version + 1, grant };
      });
    },
    async history(actor, organizationId, input = {}) {
      const { cursor } = campusParse(announcementQuery, input);
      const ctx = await access(prisma, actor, organizationId);
      if (!ctx.isPrimary && !ctx.grants.includes(MANAGE)) throw fail(403, "Campus administration permission is required.");
      const where = { campusId: organizationId, action: { in: ["SETUP_CREATED", "SETUP_UPDATED", "ACTIVATE", "PAUSE", "RESUME", "SETTINGS_UPDATED", "ENGINE_ENABLED", "ENGINE_CONFIGURED", "PERMISSION_CHANGED"] } };
      if (cursor && !await prisma.virtualCampusAudit.findFirst({ where: { ...where, id: cursor } })) throw fail(404, "Campus history page is unavailable.");
      const rows = await prisma.virtualCampusAudit.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      const latest = await access(prisma, actor, organizationId);
      if (!latest.isPrimary && !latest.grants.includes(MANAGE)) throw fail(403, "Campus administration permission is required.");
      return { organizationId, firstActivatedAt: ctx.organization.campus?.activatedAt ?? null, items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null };
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
          displayName: data.displayName, contactEmail: data.contactEmail, configurationStatus: "READY", version: { increment: 1 },
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
          where: { organizationId, enabled: true }, select: { id: true, accountId: true, role: true, permissions: true, enabled: true },
        });
        const staffIds = [];
        for (const member of members) {
          if (member.accountId === actor.accountId) continue;
          for (const scope of ["CAMPUS", ...configuredEngines(ctx.organization.campus)]) {
            if ((await campusMemberPermissions(db, ctx.organization.campus, member, scope)).length) { staffIds.push(member.accountId); break; }
          }
        }
        const recipients = staffIds.map(recipientId => ({ recipientId, href: "/organization-workspace/" + organizationId + "/campus" }));
        if (data.audience === "CAMPUS" && configuredEngines(ctx.organization.campus).includes("GRADE_SCHOOL")) {
          const learners = await db.gradeSchoolStudent.findMany({ where: { campusId: organizationId, status: "ACTIVE", account: { status: "ACTIVE" }, registrations: { some: { status: "ACTIVE" } } }, select: { accountId: true } });
          for (const learner of learners) if (learner.accountId !== actor.accountId && !staffIds.includes(learner.accountId)) recipients.push({ recipientId: learner.accountId, href: "/learning?view=campus" });
        }
        if (data.audience === "CAMPUS" && configuredEngines(ctx.organization.campus).includes("TVET")) {
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
    async assertAcademic(actor, organizationId, engine = "GRADE_SCHOOL") {
      const ctx = await access(prisma, actor, organizationId, { requireActive: true, capability: ACADEMICS, scope: engine });
      return { organizationId, engine };
    },
    async assertBilling(actor, organizationId) {
      const ctx = await access(prisma, actor, organizationId, { requireActive: true, capability: BILLING });
      return { organizationId, engine: ctx.organization.campus.engine };
    },
  };
}
