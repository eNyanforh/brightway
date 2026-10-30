import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createManagementService } from "../src/modules/management/management-access.service.js";
import { readPlatformStatistics } from "../src/modules/management/management-statistics.js";
test("database platform statistics count accounts once, honor UTC windows, aggregate all queues and deny non-root/stale access", { skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database" }, async () => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const date = new Date("2026-10-30T12:00:00Z"), day = 86400000, marker = randomUUID().slice(0, 8), accounts = [], requests = [], organizations = [], reviews = [], records = [], identities = [], profiles = [], orphan = randomUUID();
  const service = createManagementService({ prisma: db, now: () => date }); let session;
  const before = await readPlatformStatistics(db, date);
  try {
    for (const [i, status, createdAt, lastLoginAt, emailVerifiedAt] of [[0, "ACTIVE", new Date(+date - 40 * day), new Date(+date - 3600000), new Date(+date - day)], [1, "ACTIVE", date, new Date(+date + 1), null], [2, "SUSPENDED", new Date(+date - 7 * day), new Date(+date - 7 * day), new Date(+date + 1)], [3, "DEACTIVATED", new Date(+date + day), new Date(+date - 10 * day), null]]) {
      accounts.push(await db.account.create({ data: { username: `stats_${marker}_${i}`, email: `stats_${marker}_${i}@example.invalid`, passwordHash: "synthetic-unusable", status, createdAt, lastLoginAt, emailVerifiedAt, person: { create: { firstName: "Synthetic", lastName: "Statistics" } } } }));
    }
    for (const id of [accounts[0].id, accounts[2].id, orphan]) await db.mfaFactor.create({ data: { accountId: id, enabled: true, version: 1, encryptedSecret: "synthetic", windowStart: date } });
    await db.managementAdministrator.create({ data: { accountId: accounts[0].id, enabled: true, isSuperAdmin: true, version: 1, grantedAt: new Date(+date - 1000) } });
    session = await db.session.create({ data: { accountId: accounts[0].id, tokenHash: randomUUID(), expiresAt: new Date(+date + day), mfaVersion: 1, mfaVerifiedAt: date } });
    for (const [i, status] of ["APPROVED", "APPROVED", "APPROVED", "SUBMITTED", "ASSIGNED", "RECOMMENDED", "ABORTED", "REJECTED"].entries()) {
      const type = ["SCHOOL", "COMPANY", "NGO"][i % 3];
      const request = await db.organizationRequest.create({ data: { applicantId: accounts[0].id, assignedAgentId: ["SUBMITTED", "ABORTED"].includes(status) ? null : accounts[1].id, decidedById: ["APPROVED", "REJECTED"].includes(status) ? accounts[2].id : null, decidedAt: ["APPROVED", "REJECTED"].includes(status) ? date : null, status, idempotencyKey: randomUUID(), inputHash: "a".repeat(64), fingerprint: `${marker}_${i}`, name: `Statistics fixture ${i}`, type, representativeRole: "Director", countryCode: "LR", region: "Montserrado", city: "Monrovia", address: "Synthetic", offersTraining: type === "SCHOOL", targetAt: date } }); requests.push(request.id);
      if (status === "APPROVED") organizations.push((await db.organization.create({ data: { requestId: request.id, name: request.name, type, offersTraining: type === "SCHOOL", status: type === "COMPANY" ? "SUSPENDED" : "ACTIVE", verifiedAt: date } })).id);
    }
    for (const [i, state] of ["SUBMITTED", "IN_REVIEW", "APPROVED", "INVALIDATED"].entries()) identities.push((await db.manualIdentityRequest.create({ data: { accountId: accounts[i].id, state, currentAttemptId: randomUUID(), initialSubmittedAt: date, targetAt: date, calendarVersion: "synthetic-test", windowStart: date } })).id);
    const profile = await db.profile.create({ data: { personId: accounts[1].personId } }); profiles.push(profile.id);
    for (const [i, status] of ["SUBMITTED", "IN_REVIEW", "ACTION_REQUIRED", "VERIFIED", "FALSE_CREDENTIAL"].entries()) {
      const record = await db.educationRecord.create({ data: { profileId: profile.id, institution: "Synthetic school", qualification: "Synthetic diploma", startMonth: "2020-01", current: true, description: "", status } }); records.push(record.id);
      reviews.push((await db.credentialReview.create({ data: { profileId: profile.id, recordId: record.id, kind: "education", revision: 1, status, issuerOrganizationId: i % 2 ? organizations[0] : null, issuerName: i % 2 ? "Synthetic school" : null } })).id);
    }
    for (let i = 0; i < 2; i++) await db.credentialAttempt.create({ data: { reviewId: reviews[1], revision: 1, snapshot: { synthetic: true }, status: "VERIFIED", decidedAt: date } });
    const result = await service.statistics(accounts[0].id, session.id);
    const delta = (group, field) => result[group][field] - before[group][field];
    assert.deepEqual(Object.fromEntries(Object.keys(result.accounts).map(key => [key, delta("accounts", key)])), { total: 4, active: 2, suspended: 1, deactivated: 1, emailVerified: 1, mfaEnabled: 2, newLast7Days: 2, signedInLast7Days: 2 });
    assert.deepEqual(Object.fromEntries(Object.keys(result.organizations).map(key => [key, delta("organizations", key)])), { total: 3, active: 2, suspended: 1, schools: 1, companies: 1, ngos: 1 });
    assert.deepEqual(Object.fromEntries(Object.keys(result.queues).map(key => [key, delta("queues", key)])), { organizations: 3, identities: 2, credentials: 2 });
    const trend = result.registrations.map((point, i) => ({ date: point.date, count: point.count - before.registrations[i].count })); assert.equal(trend.length, 30); assert.equal(trend.reduce((sum, p) => sum + p.count, 0), 2); assert.equal(trend.find(p => p.date === "2026-10-23").count, 1); assert.equal(trend.at(-1).count, 1);
    const anotherZone = await db.$transaction(async tx => { await tx.$executeRaw`SET LOCAL TIME ZONE 'Pacific/Auckland'`; return readPlatformStatistics(tx, date); });
    assert.deepEqual(anotherZone.accounts, result.accounts); assert.deepEqual(anotherZone.registrations, result.registrations);
    for (const privateValue of [accounts[0].email, accounts[0].passwordHash, accounts[0].username, "encryptedSecret", "storageKey", reviews[0]]) assert(!JSON.stringify(result).includes(privateValue));
    await assert.rejects(service.statistics(accounts[1].id, session.id), { status: 403 });
    await db.managementAdministrator.update({ where: { accountId: accounts[0].id }, data: { isSuperAdmin: false } }); await assert.rejects(service.statistics(accounts[0].id, session.id), { status: 403 });
    await db.managementAdministrator.update({ where: { accountId: accounts[0].id }, data: { isSuperAdmin: true } }); await db.mfaFactor.update({ where: { accountId: accounts[0].id }, data: { version: 2 } }); await assert.rejects(service.statistics(accounts[0].id, session.id), { status: 403 });
  } finally {
    try {
      const ids = accounts.map(a => a.id);
      await db.credentialAttempt.deleteMany({ where: { reviewId: { in: reviews } } }); await db.credentialReview.deleteMany({ where: { id: { in: reviews } } }); await db.educationRecord.deleteMany({ where: { id: { in: records } } }); await db.profile.deleteMany({ where: { id: { in: profiles } } });
      await db.manualIdentityRequest.deleteMany({ where: { id: { in: identities } } }); await db.organization.deleteMany({ where: { id: { in: organizations } } }); await db.organizationRequest.deleteMany({ where: { id: { in: requests } } });
      await db.managementAdministrator.deleteMany({ where: { accountId: { in: ids } } }); await db.session.deleteMany({ where: { accountId: { in: ids } } }); await db.mfaFactor.deleteMany({ where: { accountId: { in: [...ids, orphan] } } }); await db.account.deleteMany({ where: { id: { in: ids } } }); await db.person.deleteMany({ where: { id: { in: accounts.map(a => a.personId) } } });
    } finally { await db.$disconnect(); }
  }
});
