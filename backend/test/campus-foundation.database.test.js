import { clearCampusFoundation } from "../test-support/campus-cleanup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createCampusService } from "../src/modules/campus/campus.service.js";
import { seedOrganizationProfile, clearOrganizationProfiles } from "../test-support/organization-profile-seed.js";

test("Campus domain foundation: concurrency, permissions, configuration, integrity and isolation", {
  skip: !process.env.TEST_DATABASE_URL && "Requires a migrated isolated TEST_DATABASE_URL"
}, async t => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }),
    transactionOptions: { timeout: 15000, maxWait: 10000 } });
  const now = () => new Date("2030-02-01T12:00:00Z");
  const campus = createCampusService({ prisma: db, now });
  const accounts = [], people = [], requests = [], organizations = [];
  const ACADEMICS = "organization.campus.academics.manage", TEACH = "organization.campus.teach";
  const ANNOUNCE = "organization.campus.announcements.manage";
  const productWhere = { product_countryCode: { product: "VIRTUAL_CAMPUS", countryCode: "LR" } };
  const oldProduct = await db.productAvailability.findUnique({ where: productWhere });
  async function account(label) {
    const marker = randomUUID().slice(0, 8);
    const a = await db.account.create({ data: { username: "camp_" + label + "_" + marker,
      email: label + "_" + marker + "@example.invalid", emailVerifiedAt: now(), passwordHash: "synthetic",
      person: { create: { firstName: "Test", lastName: label } } } });
    accounts.push(a.id); people.push(a.personId);
    await db.mfaFactor.create({ data: { accountId: a.id, enabled: true, encryptedSecret: "test-only",
      windowStart: now(), version: 1 } });
    const session = await db.session.create({ data: { accountId: a.id, tokenHash: randomUUID(),
      expiresAt: new Date("2031-01-01"), mfaVersion: 1, mfaVerifiedAt: now() } });
    return { id: a.id, sessionId: session.id, actor: { accountId: a.id, sessionId: session.id } };
  }
  async function org(owner, country, secondary = false, type = "SCHOOL") {
    const name = "Synthetic Campus " + randomUUID().slice(0, 8);
    const assignedAgentId = accounts.find(id => id !== owner.id);
    const decidedById = accounts.find(id => id !== owner.id && id !== assignedAgentId);
    const req = await db.organizationRequest.create({ data: { applicantId: owner.id,
      assignedAgentId, decidedById, decidedAt: now(), version: 4, idempotencyKey: randomUUID(),
      inputHash: "a".repeat(64), fingerprint: randomUUID(), name, type, offersTraining: true,
      representativeRole: "Administrator", countryCode: country, region: "Testing", city: "Test City",
      address: "Synthetic test address", status: "APPROVED", targetAt: now(), decidedAt: now() } });
    requests.push(req.id);
    const row = await db.organization.create({ data: { requestId: req.id, name, type,
      offersTraining: true, verifiedAt: now(), memberships: { create: { accountId: owner.id, role: "PRIMARY_ADMIN" } },
      locations: { create: [{ countryCode: country, region: "Testing", city: "Test City", address: "Synthetic site", verifiedAt: now() },
        ...(secondary ? [{ countryCode: "LR", region: "Montserrado", city: "Monrovia", address: "Verified Liberia operation",
          verifiedAt: now(), primary: false }] : [])] } } });
    organizations.push(row.id);
    return seedOrganizationProfile(db, row.id, now());
  }
  try {
    await db.productAvailability.upsert({ where: productWhere,
      create: { product: "VIRTUAL_CAMPUS", countryCode: "LR", enabled: true }, update: { enabled: true } });
    const owner = await account("owner"), worker = await account("worker"), other = await account("other");
    const school = await org(owner, "LR", false, "COMPANY"), outside = await org(other, "LR"), foreign = await org(other, "GH");
    const member = await db.organizationMembership.create({ data: { organizationId: school.id, accountId: worker.id, role: "STAFF", permissions: [ACADEMICS, TEACH] } });
    const outsiderMember = await db.organizationMembership.findFirst({ where: { organizationId: outside.id } });
    let version = 0;
    const current = () => db.virtualCampus.findUnique({ where: { organizationId: school.id } });
    const grant = async (scope, permission, enabled = true, expectedGrantVersion = 0) => {
      const result = await campus.setPermission(owner.actor, school.id, member.id, { scope, permission, enabled, expectedVersion: version, expectedGrantVersion });
      version = result.version; return result;
    };
    await t.test("four-step onboarding resumes, rejects stale writes and activates atomically without academic prerequisites", async () => {
      const institution = await org(owner, "LR", false, "NGO");
      const start = await campus.onboarding(owner.actor, institution.id);
      assert.equal(start.draft.displayName, institution.name);
      assert.equal(start.draft.version, 0);
      await assert.rejects(campus.onboarding(worker.actor, institution.id), { status: 403 });
      const identity = { requestKey: randomUUID(), expectedVersion: 0, step: 2, displayName: institution.name, enabledEngines: [] };
      const saved = await campus.saveOnboarding(owner.actor, institution.id, identity);
      assert.deepEqual(await campus.saveOnboarding(owner.actor, institution.id, identity), saved);
      assert.equal((await campus.onboarding(owner.actor, institution.id)).draft.step, 2);
      assert.equal(await db.virtualCampus.count({ where: { organizationId: institution.id } }), 0);
      await assert.rejects(campus.saveOnboarding(owner.actor, institution.id, { ...identity, displayName: "Changed" }), { status: 409 });
      const step3 = await campus.saveOnboarding(owner.actor, institution.id, { ...identity, requestKey: randomUUID(), expectedVersion: saved.version, step: 3 });
      await assert.rejects(campus.saveOnboarding(owner.actor, institution.id, { ...identity, requestKey: randomUUID(), expectedVersion: step3.version, step: 4 }), { status: 400 });
      const step4 = await campus.saveOnboarding(owner.actor, institution.id, { ...identity, requestKey: randomUUID(), expectedVersion: step3.version, step: 4, enabledEngines: ["GRADE_SCHOOL", "TVET"] });
      const body = { expectedVersion: step4.version, confirmed: true, administratorMembershipId: start.administrator.membershipId };
      await assert.rejects(campus.completeOnboarding(owner.actor, institution.id, { ...body, administratorMembershipId: member.id }), { status: 403 });
      const result = await Promise.all([campus.completeOnboarding(owner.actor, institution.id, body), campus.completeOnboarding(owner.actor, institution.id, body)]);
      assert.deepEqual(result[0], result[1]);
      assert.equal(result[0].workspacePath, `/campus/${institution.id}`);
      assert.equal(await db.virtualCampus.count({ where: { organizationId: institution.id } }), 1);
      assert.equal(await db.virtualCampusAudit.count({ where: { campusId: institution.id, action: "ACTIVATE" } }), 1);
      for (const model of ["gradeSchoolSubject", "gradeSchoolStudent", "tvetIntake", "billingCharge"]) assert.equal(await db[model].count({ where: { campusId: institution.id } }), 0);
      assert.equal((await campus.onboarding(owner.actor, institution.id)).campus.status, "ACTIVE");
    });
    await t.test("concurrent setup and activation produce one identity and one event per transition", async () => {
      const setup = { engine: "GRADE_SCHOOL", displayName: "Dual education provider", contactEmail: null, expectedVersion: 0 };
      const results = await Promise.allSettled([campus.setup(owner.actor, school.id, setup), campus.setup(owner.actor, school.id, setup)]);
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
      assert.equal(results.find(r => r.status === "rejected").reason.status, 409);
      const activation = await Promise.allSettled([campus.activate(owner.actor, school.id, { expectedVersion: 1 }), campus.activate(owner.actor, school.id, { expectedVersion: 1 })]);
      assert.equal(activation.filter(r => r.status === "fulfilled").length, 1);
      assert.equal(activation.find(r => r.status === "rejected").reason.status, 409);
      version = 2;
      assert.equal(await db.virtualCampus.count({ where: { organizationId: school.id } }), 1);
      assert.equal(await db.virtualCampusAudit.count({ where: { campusId: school.id, action: "ACTIVATE" } }), 1);
      await assert.rejects(db.virtualCampus.create({ data: { organizationId: school.id, engine: "GRADE_SCHOOL", enabledEngines: ["GRADE_SCHOOL"], displayName: "Duplicate" } }), { code: "P2002" });
      await assert.rejects(campus.setup(other.actor, foreign.id, setup), { status: 403 });
      await assert.rejects(db.virtualCampus.create({ data: { organizationId: foreign.id, engine: "TVET", enabledEngines: ["TVET"], displayName: "Ineligible" } }));
    });
    await t.test("engine addition is atomic, preserves identity, and does not create financial or learner records", async () => {
      const before = await current();
      await assert.rejects(campus.enableEngine(worker.actor, school.id, { engine: "TVET", expectedVersion: version }), { status: 403 });
      await assert.rejects(db.tvetLearner.create({ data: { campusId: school.id, accountId: worker.id } }));
      const attempts = await Promise.allSettled([campus.enableEngine(owner.actor, school.id, { engine: "TVET", expectedVersion: version }), campus.enableEngine(owner.actor, school.id, { engine: "TVET", expectedVersion: version })]);
      assert.equal(attempts.filter(r => r.status === "fulfilled").length, 1);
      assert.equal(attempts.find(r => r.status === "rejected").reason.status, 409);
      version++;
      const after = await current();
      assert.deepEqual(after.enabledEngines, ["GRADE_SCHOOL", "TVET"]);
      for (const key of ["organizationId", "engine", "status", "createdAt", "activatedAt"]) assert.deepEqual(after[key], before[key]);
      assert.equal((await campus.enableEngine(owner.actor, school.id, { engine: "TVET", expectedVersion: version })).version, version);
      const configs = await db.campusEngineConfiguration.findMany({ where: { campusId: school.id } });
      assert.equal(configs.length, 2); assert.ok(configs.every(c => c.status === "NOT_CONFIGURED"));
      assert.equal(await db.virtualCampusAudit.count({ where: { campusId: school.id, action: "ENGINE_ENABLED" } }), 1);
      for (const model of ["billingCharge", "gradeSchoolRegistration", "tvetEnrolment"]) assert.equal(await db[model].count({ where: { campusId: school.id } }), 0);
      await assert.rejects(db.virtualCampus.update({ where: { organizationId: school.id }, data: { enabledEngines: ["GRADE_SCHOOL"] } }));
      await assert.rejects(db.campusEngineConfiguration.delete({ where: { campusId_engine: { campusId: school.id, engine: "TVET" } } }));
    });
    await t.test("engine configuration and grants require current versions, scope, membership and MFA", async () => {
      const configure = (actor, engine, status, expectedEngineVersion = 1) => campus.configureEngine(actor, school.id, engine, { status, expectedVersion: version, expectedEngineVersion });
      await assert.rejects(configure(worker.actor, "TVET", "CONFIGURING"), { status: 403 });
      await assert.rejects(configure(owner.actor, "TVET", "READY"), { status: 409 });
      assert.equal((await current()).version, version);
      const schoolConfig = await configure(worker.actor, "GRADE_SCHOOL", "CONFIGURING"); version = schoolConfig.version;
      await assert.rejects(configure(worker.actor, "GRADE_SCHOOL", "CONFIGURING"), { status: 409 });
      await assert.rejects(campus.setPermission(owner.actor, school.id, outsiderMember.id, { scope: "TVET", permission: ACADEMICS, enabled: true, expectedVersion: version, expectedGrantVersion: 0 }), { status: 404 });
      await assert.rejects(campus.setPermission(worker.actor, school.id, member.id, { scope: "TVET", permission: ACADEMICS, enabled: true, expectedVersion: version, expectedGrantVersion: 0 }), { status: 403 });
      await grant("TVET", ACADEMICS);
      const configured = await configure(worker.actor, "TVET", "CONFIGURING"); version = configured.version;
      await grant("TVET", ACADEMICS, false, 1);
      await assert.rejects(configure(worker.actor, "TVET", "CONFIGURING", 2), { status: 403 });
      await grant("GRADE_SCHOOL", ACADEMICS, false);
      await assert.rejects(configure(worker.actor, "GRADE_SCHOOL", "CONFIGURING", 2), { status: 403 });
      await db.mfaFactor.update({ where: { accountId: owner.id }, data: { enabled: false } });
      await assert.rejects(grant("CAMPUS", ANNOUNCE), { status: 403 });
      await db.mfaFactor.update({ where: { accountId: owner.id }, data: { enabled: true } });
      await grant("CAMPUS", ANNOUNCE);
      await db.organizationMembership.update({ where: { id: member.id }, data: { enabled: false } });
      await assert.rejects(campus.publish(worker.actor, school.id, { requestKey: randomUUID(), title: "Not permitted", body: "Disabled member" }), { status: 403 });
      await db.organizationMembership.update({ where: { id: member.id }, data: { enabled: true } });
      const announcement = await campus.publish(worker.actor, school.id, { requestKey: randomUUID(), title: "Shared Campus", body: "Both engines share this announcement" });
      assert.equal((await campus.announcements(owner.actor, school.id)).items[0].id, announcement.id);
      assert.equal((await campus.permissionGrants(owner.actor, school.id)).items.length, 3);
      await assert.rejects(campus.history(other.actor, school.id), { status: 403 });
      await assert.rejects(campus.permissionGrants(worker.actor, school.id), { status: 403 });
    });
    await t.test("database guards reject cross-tenant grants, record moves, unsafe deletion and audit mutation", async () => {
      await campus.setup(other.actor, outside.id, { engine: "TVET", displayName: "Other Campus", contactEmail: null, expectedVersion: 0 });
      await assert.rejects(db.campusPermissionGrant.create({ data: { campusId: school.id, membershipId: outsiderMember.id, scope: "TVET", permission: TEACH } }), { code: "P2003" });
      await assert.rejects(db.campusPermissionGrant.create({ data: { campusId: outside.id, membershipId: outsiderMember.id, scope: "GRADE_SCHOOL", permission: TEACH } }));
      const subject = await db.gradeSchoolSubject.create({ data: { campusId: school.id, name: "Mathematics", passingMark: 50 } });
      await assert.rejects(db.gradeSchoolSubject.update({ where: { id: subject.id }, data: { campusId: outside.id } }));
      await assert.rejects(db.gradeSchoolSubject.update({ where: { id: subject.id }, data: { engine: "TVET" } }));
      await assert.rejects(db.virtualCampus.delete({ where: { organizationId: school.id } }), { code: "P2003" });
      await assert.rejects(db.organization.delete({ where: { id: school.id } }), { code: "P2003" });
      const audit = await db.virtualCampusAudit.findFirst({ where: { campusId: school.id } });
      await assert.rejects(db.virtualCampusAudit.update({ where: { id: audit.id }, data: { action: "ALTERED" } }));
      await assert.rejects(db.virtualCampusAudit.delete({ where: { id: audit.id } }));
      const history = await campus.history(owner.actor, school.id);
      assert.equal(history.items.length, version);
      assert.equal(new Set(history.items.map(event => event.campusVersion)).size, version);
      assert.deepEqual(history.firstActivatedAt, (await current()).activatedAt);
      await assert.rejects(campus.history(other.actor, outside.id, { cursor: audit.id }), { status: 404 });
    });
    await t.test("failed audit rolls configuration changes back in the same transaction", async () => {
      const before = await current();
      const failing = createCampusService({ now, prisma: { $transaction: fn => db.$transaction(tx => fn(new Proxy(tx, { get(target, key) { return key === "virtualCampusAudit" ? { create() { throw Error("synthetic audit failure"); } } : Reflect.get(target, key); } }))) } });
      await assert.rejects(failing.settings(owner.actor, school.id, { displayName: "Must roll back", contactEmail: null, expectedVersion: version }), /synthetic audit failure/);
      assert.deepEqual(await current(), before);
    });
  } finally {
    await clearCampusFoundation(db, organizations);
    await db.gradeSchoolSubject.deleteMany({ where: { campusId: { in: organizations } } });
    if (oldProduct) await db.productAvailability.update({ where: productWhere, data: { enabled: oldProduct.enabled } });
    else await db.productAvailability.deleteMany({ where: { product: "VIRTUAL_CAMPUS", countryCode: "LR" } });
    await db.platformNotification.deleteMany({ where: { recipientId: { in: accounts } } });
    await db.campusAnnouncement.deleteMany({ where: { campusId: { in: organizations } } });
    await db.virtualCampusAudit.deleteMany({ where: { campusId: { in: organizations } } });
    await db.virtualCampus.deleteMany({ where: { organizationId: { in: organizations } } });
    await clearOrganizationProfiles(db, organizations);
    await db.organizationOperatingLocation.deleteMany({ where: { organizationId: { in: organizations } } });
    await db.organizationMembership.deleteMany({ where: { organizationId: { in: organizations } } });
    await db.organization.deleteMany({ where: { id: { in: organizations } } });
    await db.organizationRequest.deleteMany({ where: { id: { in: requests } } });
    await db.session.deleteMany({ where: { accountId: { in: accounts } } });
    await db.mfaAudit.deleteMany({ where: { accountId: { in: accounts } } });
    await db.mfaFactor.deleteMany({ where: { accountId: { in: accounts } } });
    await db.account.deleteMany({ where: { id: { in: accounts } } });
    await db.person.deleteMany({ where: { id: { in: people } } });
    await db.$disconnect();
  }
});
