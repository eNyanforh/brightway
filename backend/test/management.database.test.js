import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createManagementService } from "../src/modules/management/management-access.service.js";
import { createStaffProvisioning } from "../src/modules/management/staff-provisioning.service.js";
test("database terminal bootstrap, Super Admin delegation, audit rollback and concurrent last-root revocation stay safe", { skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database" }, async () => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const accounts = [], sessions = [], marker = randomUUID(), before = new Date(Date.now() - 10000);
  try {
    for (const label of ["first", "second", "ordinary"]) {
      const account = await db.account.create({ data: { username: `mg_${label}_${marker.replaceAll("-", "").slice(0, 12)}`, email: `mg_${label}_${marker}@example.invalid`, passwordHash: "synthetic-unusable-hash", emailVerifiedAt: before, person: { create: { firstName: "Synthetic", lastName: label } } } }); accounts.push(account);
      await db.mfaFactor.create({ data: { accountId: account.id, enabled: true, version: 1, encryptedSecret: "synthetic-no-real-secret", windowStart: before } });
      sessions.push(await db.session.create({ data: { accountId: account.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000), mfaVersion: 1, mfaVerifiedAt: before } }));
    }
    const [first, second, ordinary] = accounts, provision = createStaffProvisioning({ prisma: db }), service = createManagementService({ prisma: db });
    const actor = account => ({ accountId: account.id, sessionId: sessions[accounts.indexOf(account)].id });
    const input = (account, capability = "superadmin", action = "grant") => ({ username: account.username, capability, action, reason: "Isolated terminal provisioning acceptance." });
    const fresh = account => db.session.update({ where: { id: actor(account).sessionId }, data: { mfaVerifiedAt: new Date() } });
    function failAudit(client) { return new Proxy(client, { get(target, key) {
      if (key === "$transaction") return work => target.$transaction(tx => work(failAudit(tx)));
      if (key === "managementAdministratorAudit") return new Proxy(target[key], { get(model, method) { if (method === "create") return async () => { throw Error("Injected management audit failure"); }; const value = model[method]; return typeof value === "function" ? value.bind(model) : value; } });
      const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
    } }); }
    await assert.rejects(createStaffProvisioning({ prisma: failAudit(db) })(input(first), actor(first), true), /Injected management audit failure/);
    assert.equal(await db.managementAdministrator.count({ where: { accountId: first.id } }), 0);
    const raced = await Promise.allSettled([provision(input(first), actor(first), true), provision(input(second), actor(second), true)]);
    assert.equal(raced.filter(row => row.status === "fulfilled").length, 1); assert.equal(raced.find(row => row.status === "rejected").reason.status, 409);
    const bootstrapRoot = await db.managementAdministrator.findFirst({ where: { enabled: true, isSuperAdmin: true } });
    const founder = accounts.find(a => a.id === bootstrapRoot.accountId), nextRoot = founder.id === first.id ? second : first;
    await assert.rejects(service.context(founder.id, actor(founder).sessionId), { status: 403 });
    await fresh(founder);
    assert.equal((await service.context(founder.id, actor(founder).sessionId)).role.isSuperAdmin, true);
    await assert.rejects(provision(input(nextRoot), actor(nextRoot)), { status: 403 });
    await assert.rejects(provision(input(founder, "superadmin", "revoke"), actor(founder)), { status: 409 });
    const retries = await Promise.all([provision(input(nextRoot), actor(founder)), provision(input(nextRoot), actor(founder))]); assert.equal(retries.filter(row => row.changed).length, 1);
    await fresh(nextRoot);
    await assert.rejects(createStaffProvisioning({ prisma: failAudit(db) })(input(ordinary, "credential-reviewer"), actor(founder)), /Injected management audit failure/);
    assert.equal((await db.account.findUnique({ where: { id: ordinary.id } })).platformRole, "MEMBER");
    assert.equal(await db.reviewerRoleAudit.count({ where: { targetAccountId: ordinary.id } }), 0);
    await provision(input(ordinary, "organization-agent"), actor(founder)); await fresh(ordinary);
    const staff = await service.context(ordinary.id, actor(ordinary).sessionId); assert.equal(staff.role.isSuperAdmin, false); assert.equal(staff.permissions.organizationAgent, true); assert.equal(staff.permissions.organizationApprover, false);
    await assert.rejects(provision(input(ordinary, "organization-approver"), actor(ordinary)), { status: 403 });
    const staffAudit = await db.managementAdministratorAudit.findFirst({ where: { targetAccountId: ordinary.id } }); assert.equal(staffAudit.actorAccountId, founder.id);
    await provision(input(ordinary, "organization-agent", "revoke"), actor(founder)); await assert.rejects(service.context(ordinary.id, actor(ordinary).sessionId), { status: 403 });
    await db.account.update({ where: { id: nextRoot.id }, data: { status: "SUSPENDED" } }); await assert.rejects(provision(input(founder, "superadmin", "revoke"), actor(founder)), { status: 409 });
    await db.account.update({ where: { id: nextRoot.id }, data: { status: "ACTIVE" } });
    const results = await Promise.allSettled([provision(input(founder, "superadmin", "revoke"), actor(founder)), provision(input(nextRoot, "superadmin", "revoke"), actor(nextRoot))]);
    assert.equal(results.filter(row => row.status === "fulfilled").length, 1); assert.equal(results.find(row => row.status === "rejected").reason.status, 409);
    const remaining = await db.managementAdministrator.findFirst({ where: { enabled: true, isSuperAdmin: true } }), keeper = accounts.find(a => a.id === remaining.accountId), removed = accounts.find(a => [first.id, second.id].includes(a.id) && a.id !== keeper.id);
    await assert.rejects(provision(input(ordinary, "identity-reviewer"), actor(removed)), { status: 403 });
    await assert.rejects(provision(input(ordinary), actor(ordinary), true), { status: 409 });
    await provision(input(removed), actor(keeper)); await assert.rejects(service.context(removed.id, actor(removed).sessionId), { status: 403 });
    assert.equal(await db.managementAdministratorAudit.count({ where: { targetAccountId: removed.id } }), 3);
    assert.equal(await db.managementAdministrator.count({ where: { enabled: true, isSuperAdmin: true } }), 2);
  } finally {
    try {
      const ids = accounts.map(a => a.id);
      await db.managementAdministratorAudit.deleteMany({ where: { targetAccountId: { in: ids } } }); await db.managementAdministrator.deleteMany({ where: { accountId: { in: ids } } });
      await db.organizationOperatorAudit.deleteMany({ where: { targetAccountId: { in: ids } } }); await db.organizationOperator.deleteMany({ where: { accountId: { in: ids } } });
      await db.reviewerRoleAudit.deleteMany({ where: { targetAccountId: { in: ids } } }); await db.manualIdentityAudit.deleteMany({ where: { targetAccountId: { in: ids } } }); await db.manualIdentityReviewer.deleteMany({ where: { accountId: { in: ids } } });
      await db.session.deleteMany({ where: { accountId: { in: ids } } }); await db.mfaFactor.deleteMany({ where: { accountId: { in: ids } } });
      await db.account.deleteMany({ where: { id: { in: ids } } }); await db.person.deleteMany({ where: { id: { in: accounts.map(a => a.personId) } } });
    } finally { await db.$disconnect(); }
  }
});
