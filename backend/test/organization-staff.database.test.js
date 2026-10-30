import { seedOrganizationProfile, clearOrganizationProfiles } from "../test-support/organization-profile-seed.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createOrganizationStaffService } from "../src/modules/organizations/organization-staff.service.js";
const POSTS = "organization.posts.publish", MANAGE = "organization.members.manage";
test("database staffing preserves consent, one-winner acceptance, scoped grants, revocation and transactional audits", { skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database" }, async () => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const accounts = [], sessions = [], marker = randomUUID(), now = new Date(), orgIds = [], requestIds = [];
  try {
    for (const label of ["owner", "staff", "agent", "admin"]) {
      const a = await db.account.create({ data: { username: `s3_${label}_${marker.replaceAll("-", "").slice(0, 12)}`, email: `s3_${label}_${marker}@example.invalid`, passwordHash: "synthetic-unusable-hash", emailVerifiedAt: now, person: { create: { firstName: "Synthetic", lastName: label } } } }); accounts.push(a);
      await db.mfaFactor.create({ data: { accountId: a.id, encryptedSecret: "synthetic-no-usable-key", enabled: true, version: 1, windowStart: now } });
      sessions.push(await db.session.create({ data: { accountId: a.id, tokenHash: randomUUID(), expiresAt: new Date(+now + 86400000), mfaVerifiedAt: now, mfaVersion: 1 } }));
    }
    const [owner, staff, agent, admin] = accounts;
    const r = await db.organizationRequest.create({ data: { applicantId: owner.id, assignedAgentId: agent.id, decidedById: admin.id, status: "APPROVED", version: 4, idempotencyKey: randomUUID(), inputHash: "a".repeat(64), fingerprint: marker, name: `Staff fixture ${marker}`, type: "SCHOOL", representativeRole: "Director", countryCode: "GH", region: "", city: "Accra", address: "Synthetic fixture", offersTraining: true, targetAt: new Date(+now + 72 * 3600000), decidedAt: now } }); requestIds.push(r.id);
    const organization = await db.organization.create({ data: { requestId: r.id, name: r.name, type: "SCHOOL", offersTraining: true, verifiedAt: now, memberships: { create: { accountId: owner.id, role: "PRIMARY_ADMIN" } } } }); orgIds.push(organization.id); await seedOrganizationProfile(db, organization.id, now);
    const service = createOrganizationStaffService({ prisma: db, storage: { async get() { return Buffer.from("synthetic staff photo"); } } }), context = () => service.context(owner.id, sessions[0].id, organization.id);
    const otherRequest = await db.organizationRequest.create({ data: { applicantId: staff.id, assignedAgentId: agent.id, decidedById: admin.id, status: "APPROVED", version: 4, idempotencyKey: randomUUID(), inputHash: "b".repeat(64), fingerprint: `other_${marker}`, name: `Other tenant ${marker}`, type: "COMPANY", representativeRole: "Director", countryCode: "US", region: "", city: "Synthetic", address: "Synthetic fixture", offersTraining: false, targetAt: new Date(+now + 72 * 3600000), decidedAt: now } }); requestIds.push(otherRequest.id);
    const otherOrg = await db.organization.create({ data: { requestId: otherRequest.id, name: otherRequest.name, type: "COMPANY", offersTraining: false, verifiedAt: now, memberships: { create: { accountId: staff.id, role: "PRIMARY_ADMIN" } } } }); orgIds.push(otherOrg.id); await seedOrganizationProfile(db, otherOrg.id, now);
    await assert.rejects(service.context(owner.id, sessions[0].id, otherOrg.id), { status: 403 });
    await assert.rejects(service.staff(owner.id, sessions[0].id, otherOrg.id), { status: 403 });
    const otherPrimary = await db.organizationMembership.findFirst({ where: { organizationId: otherOrg.id } });
    await assert.rejects(service.change(owner.id, sessions[0].id, organization.id, otherPrimary.id, { expectedStaffVersion: 1, expectedVersion: 1, permissions: [], enabled: false }), { status: 404 });
    const foreignInvite = await service.invite(staff.id, sessions[1].id, otherOrg.id, { expectedStaffVersion: 1, idempotencyKey: randomUUID(), username: agent.username, permissions: [POSTS] });
    await assert.rejects(service.cancel(owner.id, sessions[0].id, organization.id, foreignInvite.id, { expectedStaffVersion: 1, expectedVersion: 1 }), { status: 404 });
    await assert.rejects(service.respond(owner.id, sessions[0].id, foreignInvite.id, { expectedVersion: 1, decision: "ACCEPT" }), { status: 404 });
    const input = { expectedStaffVersion: 1, idempotencyKey: randomUUID(), username: staff.username, permissions: [POSTS] };
    const copies = await Promise.all([service.invite(owner.id, sessions[0].id, organization.id, input), service.invite(owner.id, sessions[0].id, organization.id, input)]); assert.equal(copies[0].id, copies[1].id);
    assert.equal(await db.organizationMembership.count({ where: { organizationId: organization.id } }), 1);
    const invited = await service.directory(staff.id, sessions[1].id, { tab: "invitations", search: "STAFF FIXTURE" });
    assert.equal(invited.items.length, 1); assert.equal(invited.items[0].organization.id, organization.id); assert.equal(invited.counts.approved, 0);
    const owned = await service.directory(owner.id, sessions[0].id, { search: "staff fixture" }); assert.equal(owned.items[0].id, organization.id); assert.equal(owned.counts.approved, 1);
    const ownerMembership = await db.organizationMembership.findFirst({ where: { accountId: owner.id, organizationId: organization.id } });
    await assert.rejects(service.directory(staff.id, sessions[1].id, { cursor: ownerMembership.id }), { status: 409 });
    const invite = copies[0], accept = () => service.respond(staff.id, sessions[1].id, invite.id, { expectedVersion: 1, decision: "ACCEPT" });
    function failAudit(client) { return new Proxy(client, { get(target, key) {
      if (key === "$transaction") return work => target.$transaction(tx => work(failAudit(tx)));
      if (key === "organizationStaffAudit") return { create: async () => { throw Error("Injected staff audit failure"); } };
      const v = target[key]; return typeof v === "function" ? v.bind(target) : v;
    } }); }
    await assert.rejects(createOrganizationStaffService({ prisma: failAudit(db) }).respond(staff.id, sessions[1].id, invite.id, { expectedVersion: 1, decision: "ACCEPT" }), /Injected staff audit failure/);
    assert.equal((await db.organizationInvitation.findUnique({ where: { id: invite.id } })).state, "PENDING"); assert.equal(await db.organizationMembership.count({ where: { organizationId: organization.id } }), 1);
    const responses = await Promise.allSettled([accept(), accept()]); assert.equal(responses.filter(x => x.status === "fulfilled").length, 1); assert.equal(responses.find(x => x.status === "rejected").reason.status, 409);
    const member = await db.organizationMembership.findFirst({ where: { organizationId: organization.id, accountId: staff.id } }); assert.equal(member.role, "STAFF"); assert.deepEqual(member.permissions, [POSTS]);
    assert.equal(await db.organizationStaffAudit.count({ where: { organizationId: organization.id, action: "INVITATION_ACCEPTED" } }), 1);
    const staffPhoto = await db.photoAsset.create({ data: { personId: staff.personId, storageKey: `synthetic/staff/${marker}`, state: "CLAIMED", expiresAt: now } });
    await db.profile.create({ data: { personId: staff.personId, photoId: staffPhoto.id } });
    const roster = await service.staff(owner.id, sessions[0].id, organization.id), staffRow = roster.members.find(m => m.username === staff.username);
    assert.equal(staffRow.fullName, "Synthetic staff"); assert.equal(staffRow.photoPath, `/organization-workspace/${organization.id}/staff/people/${staff.id}/photo/${staffPhoto.id}`);
    assert.equal((await service.photo(owner.id, sessions[0].id, organization.id, staff.id, staffPhoto.id)).toString(), "synthetic staff photo");
    await assert.rejects(service.photo(owner.id, sessions[0].id, otherOrg.id, staff.id, staffPhoto.id), { status: 403 });
    await assert.rejects(service.photo(owner.id, sessions[0].id, organization.id, agent.id, staffPhoto.id), { status: 404 });

    assert.equal((await service.directory(staff.id, sessions[1].id, { tab: "invitations" })).items.length, 0);
    assert.equal((await service.directory(staff.id, sessions[1].id, { search: "staff fixture" })).items[0].id, organization.id);
    await assert.rejects(service.staff(staff.id, sessions[1].id, organization.id), { status: 403 });
    const scope = await context(), update = { expectedStaffVersion: scope.staffVersion, expectedVersion: member.version, permissions: [MANAGE], enabled: true };
    const edits = await Promise.allSettled([service.change(owner.id, sessions[0].id, organization.id, member.id, update), service.change(owner.id, sessions[0].id, organization.id, member.id, update)]); assert.equal(edits.filter(x => x.status === "fulfilled").length, 1);
    const delegatedInvite = await service.invite(staff.id, sessions[1].id, organization.id, { expectedStaffVersion: (await context()).staffVersion, idempotencyKey: randomUUID(), username: agent.username, permissions: [MANAGE] });
    const latest = await db.organizationMembership.findUnique({ where: { id: member.id } });
    await service.change(owner.id, sessions[0].id, organization.id, member.id, { expectedStaffVersion: (await context()).staffVersion, expectedVersion: latest.version, permissions: [], enabled: false });
    assert.equal((await service.directory(staff.id, sessions[1].id, { search: "staff fixture" })).items.length, 0);
    await assert.rejects(service.context(staff.id, sessions[1].id, organization.id), { status: 403 });
    await assert.rejects(service.respond(agent.id, sessions[2].id, delegatedInvite.id, { expectedVersion: 1, decision: "ACCEPT" }), { status: 409 });
    assert.equal(await db.organizationMembership.count({ where: { organizationId: organization.id, accountId: agent.id } }), 0);
    const primary = await db.organizationMembership.findFirst({ where: { organizationId: organization.id, role: "PRIMARY_ADMIN" } });
    await assert.rejects(service.change(owner.id, sessions[0].id, organization.id, primary.id, { expectedStaffVersion: (await context()).staffVersion, expectedVersion: 1, permissions: [], enabled: false }), { status: 409 });
    // Directory search/counts use database predicates, not the first loaded page.
    await db.organizationMembership.update({ where: { id: member.id }, data: { permissions: [POSTS], enabled: false } });
    const revoked = await service.staff(owner.id, sessions[0].id, organization.id, { search: `@${staff.username.toUpperCase()}`, memberStatus: "revoked" });
    assert.equal(revoked.members.length, 1); assert.deepEqual(revoked.members[0].permissions, []); assert.deepEqual(revoked.members[0].assignedPermissions, [POSTS]);
    assert.equal(revoked.members[0].canManage, true); assert.equal(revoked.counts.revoked, 1); assert.equal(revoked.counts.enabled, 0);
    await assert.rejects(service.staff(owner.id, sessions[0].id, organization.id, { memberCursor: primary.id, memberStatus: "revoked" }), { status: 404 });
    assert.equal((await service.staff(owner.id, sessions[0].id, organization.id, { search: "%" })).members.length, 0);
    await db.account.update({ where: { id: owner.id }, data: { username: `plain${marker.replaceAll("-", "").slice(0, 12)}` } });
    const underscore = await service.staff(owner.id, sessions[0].id, organization.id, { search: "_" });
    assert.deepEqual(underscore.members.map(m => m.username), [staff.username]);
    await db.organizationInvitation.update({ where: { id: delegatedInvite.id }, data: { expiresAt: new Date(0) } });
    const directory = await service.staff(owner.id, sessions[0].id, organization.id); assert.deepEqual(directory.counts, { all: 2, enabled: 1, revoked: 1, pending: 0 });
    assert.equal(directory.invitations.length, 0);
    const restored = await db.organizationMembership.findUnique({ where: { id: member.id } });
    await service.change(owner.id, sessions[0].id, organization.id, member.id, { expectedStaffVersion: (await context()).staffVersion, expectedVersion: restored.version, permissions: revoked.members[0].assignedPermissions, enabled: true });
    assert.deepEqual((await service.context(staff.id, sessions[1].id, organization.id)).permissions, [POSTS]);
    await db.organization.update({ where: { id: organization.id }, data: { status: "SUSPENDED" } }); await assert.rejects(context(), { status: 404 });
    assert.equal((await db.account.findUnique({ where: { id: staff.id } })).platformRole, "MEMBER");
  } finally {
    try {
      await clearOrganizationProfiles(db, orgIds);
      await db.organizationStaffAudit.deleteMany({ where: { organizationId: { in: orgIds } } }); await db.organizationInvitation.deleteMany({ where: { organizationId: { in: orgIds } } });
      await db.organizationMembership.deleteMany({ where: { organizationId: { in: orgIds } } }); await db.organization.deleteMany({ where: { id: { in: orgIds } } }); await db.organizationRequest.deleteMany({ where: { id: { in: requestIds } } });
      await db.profile.deleteMany({ where: { personId: { in: accounts.map(a => a.personId) } } });
      await db.photoAsset.deleteMany({ where: { personId: { in: accounts.map(a => a.personId) } } });
      const ids = accounts.map(a => a.id); await db.session.deleteMany({ where: { accountId: { in: ids } } }); await db.mfaFactor.deleteMany({ where: { accountId: { in: ids } } }); await db.account.deleteMany({ where: { id: { in: ids } } }); await db.person.deleteMany({ where: { id: { in: accounts.map(a => a.personId) } } });
    } finally { await db.$disconnect(); }
  }
});
