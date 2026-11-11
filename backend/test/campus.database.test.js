import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createCampusService } from "../src/modules/campus/campus.service.js";
import { createOrganizationStaffService } from "../src/modules/organizations/organization-staff.service.js";
import { seedOrganizationProfile, clearOrganizationProfiles } from "../test-support/organization-profile-seed.js";

test("Sprint 9 real-PostgreSQL activation, permission revocation, isolation, notifications and audit", {
  skip: !process.env.TEST_DATABASE_URL && "Requires a migrated isolated TEST_DATABASE_URL"
}, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }),
    transactionOptions: { timeout: 15000, maxWait: 10000 } });
  const now = () => new Date("2030-02-01T12:00:00Z");
  const campus = createCampusService({ prisma: db, now }), staffService = createOrganizationStaffService({ prisma: db, now });
  const accounts = [], people = [], requests = [], organizations = [];
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
    const owner = await account("owner"), worker = await account("worker"), abroad = await account("abroad"), outsider = await account("outsider");
    const school = await org(owner, "LR"), globalOrg = await org(abroad, "GH", true, "COMPANY"), outside = await org(outsider, "GH", false, "COMPANY");
    await db.organizationMembership.create({ data: { organizationId: school.id, accountId: worker.id,
      role: "STAFF", permissions: [ANNOUNCE] } });
    assert.equal((await campus.availability(owner.actor, school.id)).eligible, true);
    assert.equal((await campus.availability(abroad.actor, globalOrg.id)).eligible, true);
    assert.equal((await campus.availability(outsider.actor, outside.id)).eligible, false);
    await assert.rejects(campus.availability(worker.actor, globalOrg.id), { status: 403 });
    await assert.rejects(campus.setup(outsider.actor, outside.id, { engine: "TVET", displayName: "No",
      contactEmail: null, expectedVersion: 0 }), { status: 403 });
    assert.equal((await staffService.context(owner.id, owner.sessionId, school.id)).permissions.some(p => p.startsWith("organization.campus.")), false);
    const setup = await campus.setup(owner.actor, school.id, { engine: "GRADE_SCHOOL",
      displayName: "Synthetic Grade School", contactEmail: null, expectedVersion: 0 });
    assert.equal(setup.status, "SETUP");
    await assert.rejects(campus.assertBilling(owner.actor, school.id), { status: 403 });
    await assert.rejects(campus.activate(worker.actor, school.id, { expectedVersion: 1 }), { status: 403 });
    await assert.rejects(campus.activate(owner.actor, school.id, { expectedVersion: 2 }), { status: 409 });
    const active = await campus.activate(owner.actor, school.id, { expectedVersion: 1 });
    assert.equal(active.version, 2);
    assert.equal((await campus.assertBilling(owner.actor, school.id)).engine, "GRADE_SCHOOL");
    assert((await staffService.context(worker.id, worker.sessionId, school.id)).permissions.includes(ANNOUNCE));
    await assert.rejects(campus.assertBilling(worker.actor, school.id), { status: 403 });
    await assert.rejects(campus.settings(worker.actor, school.id, { displayName: "No", contactEmail: null, expectedVersion: 2 }), { status: 403 });
    const key = randomUUID(), body = { requestKey: key, title: "Term planning", body: "Meeting this Friday" };
    const announcement = await campus.publish(worker.actor, school.id, body);
    assert.equal((await campus.publish(worker.actor, school.id, body)).id, announcement.id);
    await assert.rejects(campus.publish(worker.actor, school.id, { ...body, title: "Changed" }), { status: 409 });
    assert.equal((await campus.announcements(owner.actor, school.id)).items.length, 1);
    assert.equal(await db.platformNotification.count({ where: { recipientId: owner.id,
      eventKey: "campus:" + school.id + ":announcement:" + announcement.id } }), 1);
    await assert.rejects(campus.announcements(abroad.actor, school.id), { status: 403 });
    await campus.withdraw(owner.actor, school.id, announcement.id, { expectedVersion: 1 });
    assert.equal((await campus.announcements(owner.actor, school.id)).items.length, 0);
    assert.equal(await db.virtualCampusAudit.count({ where: { campusId: school.id } }) >= 4, true);
    await db.mfaFactor.update({ where: { accountId: owner.id }, data: { enabled: false } });
    await assert.rejects(campus.pause(owner.actor, school.id, { expectedVersion: 2 }), { status: 403 });
    await db.mfaFactor.update({ where: { accountId: owner.id }, data: { enabled: true } });
    await campus.pause(owner.actor, school.id, { expectedVersion: 2 });
    assert.equal((await staffService.context(worker.id, worker.sessionId, school.id)).permissions.includes(ANNOUNCE), false);
    await assert.rejects(campus.publish(worker.actor, school.id, { ...body, requestKey: randomUUID() }), { status: 409 });
    await campus.resume(owner.actor, school.id, { expectedVersion: 3 });
    await db.organizationOperatingLocation.deleteMany({ where: { organizationId: school.id, countryCode: "LR" } });
    assert.equal((await campus.availability(owner.actor, school.id)).campus.status, "BLOCKED");
    assert.equal((await staffService.context(worker.id, worker.sessionId, school.id)).permissions.includes(ANNOUNCE), false);
    await db.organizationOperatingLocation.create({ data: { organizationId: school.id, countryCode: "LR",
      region: "Montserrado", city: "Monrovia", address: "Reverified test site", verifiedAt: now() } });
    await db.productAvailability.update({ where: productWhere, data: { enabled: false } });
    assert.equal((await campus.availability(owner.actor, school.id)).eligible, false);
    assert.equal((await staffService.context(worker.id, worker.sessionId, school.id)).permissions.includes(ANNOUNCE), false);
    await db.productAvailability.update({ where: productWhere, data: { enabled: true } });
    assert.equal((await campus.availability(owner.actor, school.id)).campus.status, "ACTIVE");
    await assert.rejects(campus.setup(owner.actor, school.id, { engine: "TVET",
      displayName: "Cannot change engine", contactEmail: null, expectedVersion: 4 }), { status: 409 });
    assert.equal((await campus.setup(abroad.actor, globalOrg.id, { engine: "TVET",
      displayName: "Liberia branch", contactEmail: null, expectedVersion: 0 })).engine, "TVET");
    assert.equal(await db.virtualCampus.count({ where: { organizationId: outside.id } }), 0);
  } finally {
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
