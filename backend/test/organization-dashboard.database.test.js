import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createOrganizationStaffService } from "../src/modules/organizations/organization-staff.service.js";
import { createCredentialService } from "../src/modules/credentials/credential.service.js";
import { seedOrganizationProfile, clearOrganizationProfiles } from "../test-support/organization-profile-seed.js";

test("database Dashboard aggregates isolate issuers/kinds/owners, deduplicate final decisions and honor UTC boundaries and current access", { skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database" }, async () => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const date = new Date("2026-10-30T12:00:00Z"), day = 86400000, ago = days => new Date(+date - days * day), from = new Date("2026-10-24T00:00:00Z");
  const accounts = [], sessions = [], orgs = [], requests = [], profiles = [], reviews = [], marker = randomUUID().slice(0, 8);
  const staff = createOrganizationStaffService({ prisma: db, now: () => date });
  try {
    for (let i = 0; i < 6; i++) {
      const account = await db.account.create({ data: { username: `dash_${marker}_${i}`, email: `dash_${marker}_${i}@example.invalid`, passwordHash: "unusable-synthetic", emailVerifiedAt: date, person: { create: { firstName: "Synthetic", lastName: "Dashboard" } } } }); accounts.push(account);
      await db.mfaFactor.create({ data: { accountId: account.id, enabled: true, version: 1, encryptedSecret: "synthetic", windowStart: date } });
      sessions.push(await db.session.create({ data: { accountId: account.id, tokenHash: randomUUID(), expiresAt: new Date(+date + day), mfaVerifiedAt: date, mfaVersion: 1 } }));
    }
    for (let i = 0; i < 2; i++) {
      const request = await db.organizationRequest.create({ data: { applicantId: accounts[i ? 4 : 0].id, assignedAgentId: accounts[1].id, decidedById: accounts[2].id, status: "APPROVED", version: 4, idempotencyKey: randomUUID(), inputHash: "a".repeat(64), fingerprint: `${marker}_${i}`, name: `Dashboard fixture ${marker} ${i}`, type: "SCHOOL", representativeRole: "Director", countryCode: "LR", region: "Montserrado", city: "Monrovia", address: "Synthetic", offersTraining: true, targetAt: date, decidedAt: date } }); requests.push(request.id);
      const organization = await db.organization.create({ data: { requestId: request.id, name: request.name, type: "SCHOOL", offersTraining: true, verifiedAt: date, memberships: { create: { accountId: accounts[i ? 4 : 0].id, role: "PRIMARY_ADMIN" } } } }); orgs.push(organization.id); await seedOrganizationProfile(db, organization.id, date);
    }
    for (const i of [1, 2, 3]) await db.organizationMembership.create({ data: { organizationId: orgs[0], accountId: accounts[i].id, role: "STAFF", enabled: i !== 3, permissions: i === 1 ? ["organization.credentials.education.review"] : i === 2 ? ["organization.credentials.experience.review"] : [] } });
    for (const [recipient, days] of [[3, 1], [4, 3], [5, 0]]) await db.organizationInvitation.create({ data: { organizationId: orgs[0], senderId: accounts[0].id, recipientId: accounts[recipient].id, permissions: [], idempotencyKey: randomUUID(), inputHash: "a".repeat(64), expiresAt: new Date(+date + days * day) } });
    for (const i of [0, 3]) profiles.push(await db.profile.create({ data: { personId: accounts[i].personId } }));
    async function claim({ kind = "education", status = "SUBMITTED", initial = ago(1), issuer = orgs[0], profile = profiles[1], decisions = [], reviewerId = null } = {}) {
      const recordId = randomUUID();
      await db[kind === "education" ? "educationRecord" : "experienceRecord"].create({ data: { id: recordId, profileId: profile.id, status, startMonth: "2020-01", endMonth: "2021-01", current: false, description: "", ...(kind === "education" ? { institution: "Synthetic school", qualification: "Synthetic diploma" } : { organization: "Synthetic employer", role: "Worker", type: "EMPLOYMENT" }) } });
      const review = await db.credentialReview.create({ data: { profileId: profile.id, recordId, kind, revision: 1, status, issuerOrganizationId: issuer, issuerName: issuer ? "Synthetic issuer" : null, initialSubmittedAt: initial, submittedAt: initial, reviewerId } }); reviews.push(review.id);
      for (const [decision, decidedAt, overrideIssuer] of decisions) await db.credentialAttempt.create({ data: { reviewId: review.id, revision: 1, snapshot: { synthetic: true }, status: decision, issuerOrganizationId: overrideIssuer === undefined ? issuer : overrideIssuer, issuerName: (overrideIssuer === undefined ? issuer : overrideIssuer) ? "Synthetic issuer" : null, createdAt: initial, decidedAt } });
      return review;
    }
    const unassigned = await claim({ initial: ago(8) });
    await claim({ status: "IN_REVIEW", reviewerId: accounts[1].id, decisions: [["VERIFIED", ago(0), orgs[1]]] }); // Foreign attempt cannot contribute.
    await claim({ status: "ACTION_REQUIRED", initial: ago(9), decisions: [["ACTION_REQUIRED", ago(1)]] });
    await claim({ status: "VERIFIED", initial: ago(10), decisions: [["UNABLE_TO_VERIFY", ago(5)], ["VERIFIED", ago(1)]] });
    await claim({ status: "FALSE_CREDENTIAL", initial: ago(2), decisions: [["FALSE_CREDENTIAL", ago(1)]] });
    await claim({ status: "VERIFIED", initial: ago(20), decisions: [["VERIFIED", ago(10)]] });
    await claim({ initial: from }); await claim({ initial: new Date(+from - 1) });
    await claim({ status: "VERIFIED", initial: ago(3), decisions: [["VERIFIED", date]] });
    await claim({ status: "IN_REVIEW", initial: ago(3), reviewerId: accounts[1].id, decisions: [["VERIFIED", new Date(+date + 1)]] });
    await claim({ kind: "experience", initial: ago(2) });
    await claim({ profile: profiles[0], initial: ago(2) }); // Excluded from this primary administrator's actionable scope.
    await claim({ issuer: orgs[1] }); await claim({ issuer: null }); await claim({ initial: new Date(+date + 1) });
    const read = (i = 0, days = "7") => staff.dashboard(accounts[i].id, sessions[i].id, orgs[0], { days });
    const seven = await read();
    assert.deepEqual(seven.team.data, { enabledMembers: 3, pendingInvitations: 2, expiringInvitations: 1 });
    assert.equal(seven.reviews.data.newClaims, 6); assert.equal(seven.reviews.data.completedClaims, 3);
    assert.deepEqual(seven.reviews.data.outcomes, { VERIFIED: 2, UNABLE_TO_VERIFY: 0, FALSE_CREDENTIAL: 1 });
    assert.equal(seven.reviews.data.unassigned, 4); assert.equal(seven.reviews.data.pastTarget, 1);
    assert.equal(seven.reviews.data.medianHours, 72);
    assert.equal(seven.reviews.data.trend.length, 7);
    assert.equal(seven.reviews.data.trend.reduce((sum, p) => sum + p.submissions, 0), 6);
    assert.equal(seven.reviews.data.trend.reduce((sum, p) => sum + p.decisions, 0), 3);
    assert.equal(seven.reviews.data.trend[0].submissions, 1); assert.equal(seven.reviews.data.trend.at(-1).decisions, 1);
    const ninety = await read(0, "90"); assert.equal(ninety.reviews.data.trend.length, 13); assert.equal(ninety.reviews.data.completedClaims, 4);
    const education = await read(1); assert.deepEqual(education.team, { access: "permission_required" }); assert.deepEqual(education.reviews.kinds, ["education"]);
    assert.equal(education.reviews.data.current.SUBMITTED, 4);
    const experience = await read(2); assert.equal(experience.reviews.data.current.SUBMITTED, 1); assert.equal(experience.reviews.data.completedClaims, 0);
    const zoneIndependent = await db.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'Pacific/Auckland'`;
      const inTransaction = createOrganizationStaffService({ prisma: { $transaction: work => work(tx) }, now: () => date });
      return inTransaction.dashboard(accounts[0].id, sessions[0].id, orgs[0], { days: "7" });
    });
    assert.deepEqual(zoneIndependent.reviews.data, seven.reviews.data); assert.deepEqual(zoneIndependent.team.data, seven.team.data);
    const credentials = createCredentialService({ prisma: db, storage: {}, now: () => date });
    const pending = await credentials.queue(accounts[0].id, null, sessions[0].id, orgs[0], { filter: "unassigned" });
    // A future initial timestamp is not actionable until the clock reaches it.
    assert(pending.reviews.every(row => row.status === "SUBMITTED" && row.reviewerId === null)); assert(pending.reviews.some(row => row.id === unassigned.id));
    const past = await credentials.queue(accounts[0].id, null, sessions[0].id, orgs[0], { filter: "past_target" }); assert.deepEqual(past.reviews.map(r => r.id), [unassigned.id]);
    await db.organizationMembership.updateMany({ where: { organizationId: orgs[0], accountId: accounts[1].id }, data: { permissions: ["organization.credentials.experience.review"] } });
    assert.deepEqual((await read(1)).reviews.kinds, ["experience"]);
    await db.organizationMembership.updateMany({ where: { organizationId: orgs[0], accountId: accounts[1].id }, data: { enabled: false } });
    await assert.rejects(read(1), { status: 403 }); await assert.rejects(read(4), { status: 403 });
    await db.mfaFactor.update({ where: { accountId: accounts[0].id }, data: { enabled: false } });
    const locked = await read(); assert.deepEqual(locked.team, { access: "mfa_required" }); assert.equal("data" in locked.reviews, false);
  } finally {
    try {
      await db.credentialAttempt.deleteMany({ where: { reviewId: { in: reviews } } }); await db.credentialReview.deleteMany({ where: { id: { in: reviews } } });
      const profileIds = profiles.map(p => p.id); await db.educationRecord.deleteMany({ where: { profileId: { in: profileIds } } }); await db.experienceRecord.deleteMany({ where: { profileId: { in: profileIds } } }); await db.profile.deleteMany({ where: { id: { in: profileIds } } });
      await db.organizationInvitation.deleteMany({ where: { organizationId: { in: orgs } } }); await clearOrganizationProfiles(db, orgs);
      await db.organizationMembership.deleteMany({ where: { organizationId: { in: orgs } } }); await db.organization.deleteMany({ where: { id: { in: orgs } } }); await db.organizationRequest.deleteMany({ where: { id: { in: requests } } });
      const accountIds = accounts.map(a => a.id); await db.session.deleteMany({ where: { accountId: { in: accountIds } } }); await db.mfaFactor.deleteMany({ where: { accountId: { in: accountIds } } }); await db.account.deleteMany({ where: { id: { in: accountIds } } }); await db.person.deleteMany({ where: { id: { in: accounts.map(a => a.personId) } } });
    } finally { await db.$disconnect(); }
  }
});
