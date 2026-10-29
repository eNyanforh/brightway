import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createOrganizationProfileService } from "../src/modules/organizations/organization-profile.service.js";
import { createOrganizationStaffService } from "../src/modules/organizations/organization-staff.service.js";
import { clearOrganizationProfiles } from "../test-support/organization-profile-seed.js";
test("database organization usernames, setup/upload races, stale edits, revoked access and failed audits preserve one current picture", { skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database" }, async () => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const accounts = [], sessions = [], requests = [], orgs = [], date = new Date(), marker = randomUUID().replaceAll("-", "").slice(0, 12), objects = new Map();
  const storage = { check() {}, async put(key, bytes) { objects.set(key, bytes); }, async get(key) { return objects.get(key); }, async delete(key) { objects.delete(key); } };
  const make = prisma => createOrganizationProfileService({ prisma, storage, process: async bytes => ({ bytes, width: 128, height: 128 }) });
  const profiles = make(db), staff = createOrganizationStaffService({ prisma: db });
  try {
    for (let i = 0; i < 3; i++) {
      const account = await db.account.create({ data: { username: `op_${marker}_${i}`, email: `op_${marker}_${i}@example.invalid`, passwordHash: "unusable-fixture", emailVerifiedAt: date, person: { create: { firstName: "Synthetic", lastName: "Organization" } } } }); accounts.push(account);
      await db.mfaFactor.create({ data: { accountId: account.id, enabled: true, version: 1, encryptedSecret: "synthetic-no-secret", windowStart: date } });
      sessions.push(await db.session.create({ data: { accountId: account.id, tokenHash: randomUUID(), expiresAt: new Date(+date + 86400000), mfaVersion: 1, mfaVerifiedAt: date } }));
    }
    for (let i = 0; i < 2; i++) {
      const request = await db.organizationRequest.create({ data: { applicantId: accounts[i].id, assignedAgentId: accounts[2].id, decidedById: accounts[1 - i].id, status: "APPROVED", version: 4, idempotencyKey: randomUUID(), inputHash: "b".repeat(64), fingerprint: `${marker}_${i}`, name: `Profile fixture ${i}`, type: "SCHOOL", representativeRole: "Director", countryCode: "GH", region: "", city: "Accra", address: "Synthetic", offersTraining: true, targetAt: date, decidedAt: date } }); requests.push(request.id);
      const organization = await db.organization.create({ data: { requestId: request.id, name: request.name, type: "SCHOOL", offersTraining: true, verifiedAt: date, memberships: { create: { accountId: accounts[i].id, role: "PRIMARY_ADMIN" } } } }); orgs.push(organization.id);
    }
    const save = (i, username, expectedVersion = 0, service = profiles) => service.saveUsername(accounts[i].id, sessions[i].id, orgs[i], { username, expectedVersion });
    const upload = (version, service = profiles) => service.uploadPhoto(accounts[0].id, sessions[0].id, orgs[0], version, Buffer.from("synthetic-picture"), "image/png");
    assert.equal((await profiles.read(accounts[0].id, sessions[0].id, orgs[0])).required, true);
    assert.equal((await staff.context(accounts[0].id, sessions[0].id, orgs[0])).workspace.available.length, 0);
    await assert.rejects(staff.staff(accounts[0].id, sessions[0].id, orgs[0]), { status: 409 });
    await assert.rejects(profiles.read(accounts[2].id, sessions[2].id, orgs[0]), { status: 403 });
    const duplicate = await Promise.allSettled([save(0, `school_${marker}`), save(1, `SCHOOL_${marker}`)]);
    assert.equal(duplicate.filter(r => r.status === "fulfilled").length, 1); assert.equal(duplicate.find(r => r.status === "rejected").reason.status, 409);
    const loser = duplicate.findIndex(r => r.status === "rejected"); await save(loser, `school_${marker}_${loser}`);
    const invalidReady = () => db.organization.update({ where: { id: orgs[0] }, data: { profileReadyAt: date } }); await assert.rejects(invalidReady);
    function failAudit(client) { return new Proxy(client, { get(target, key) {
      if (key === "$transaction") return work => target.$transaction(tx => work(failAudit(tx)));
      if (key === "organizationStaffAudit") return { create: async () => { throw Error("Injected profile audit failure"); } };
      const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
    } }); }
    await assert.rejects(save(0, `changed_${marker}`, 1, make(failAudit(db))), /Injected profile audit failure/);
    assert.equal((await db.organization.findUnique({ where: { id: orgs[0] } })).profileVersion, 1);
    await assert.rejects(upload(1, make(failAudit(db))), /Injected profile audit failure/);
    assert.equal((await db.organization.findUnique({ where: { id: orgs[0] } })).profilePhotoId, null);
    const raced = await Promise.allSettled([upload(1), upload(1)]);
    assert.equal(raced.filter(r => r.status === "fulfilled").length, 1); assert.equal(raced.find(r => r.status === "rejected").reason.status, 409);
    const done = raced.find(r => r.status === "fulfilled").value; assert.equal(done.required, false);
    assert.equal(await db.organizationPhoto.count({ where: { organizationId: orgs[0], state: "CLAIMED" } }), 1);
    assert.equal(await db.organizationStaffAudit.count({ where: { organizationId: orgs[0], action: "PROFILE_SETUP_COMPLETED" } }), 1);
    await assert.rejects(upload(1), { status: 409 });
    // Revoke the writer while external object I/O is in flight; the final transaction must recheck.
    storage.put = async (key, bytes) => { objects.set(key, bytes); await db.organizationMembership.updateMany({ where: { organizationId: orgs[0], accountId: accounts[0].id }, data: { enabled: false, version: { increment: 1 } } }); };
    await assert.rejects(upload(2), { status: 403 });
    assert.equal((await db.organization.findUnique({ where: { id: orgs[0] } })).profilePhotoId, done.photo.id);
    const cleanup = await profiles.cleanup(); assert.equal(cleanup.failed, 0); assert(cleanup.deleted >= 2);
    assert.equal(await db.organizationPhoto.count({ where: { organizationId: orgs[0], state: "CLAIMED" } }), 1);
    assert.equal((await profiles.readPhoto(orgs[0], done.photo.id)).toString(), "synthetic-picture");
    await assert.rejects(profiles.readPhoto(orgs[1], done.photo.id), { status: 404 });
  } finally {
    try {
      await clearOrganizationProfiles(db, orgs);
      await db.organizationStaffAudit.deleteMany({ where: { organizationId: { in: orgs } } }); await db.organizationMembership.deleteMany({ where: { organizationId: { in: orgs } } });
      await db.organization.deleteMany({ where: { id: { in: orgs } } }); await db.organizationRequest.deleteMany({ where: { id: { in: requests } } });
      const ids = accounts.map(a => a.id); await db.session.deleteMany({ where: { accountId: { in: ids } } }); await db.mfaFactor.deleteMany({ where: { accountId: { in: ids } } });
      await db.account.deleteMany({ where: { id: { in: ids } } }); await db.person.deleteMany({ where: { id: { in: accounts.map(a => a.personId) } } });
    } finally { await db.$disconnect(); }
  }
});
