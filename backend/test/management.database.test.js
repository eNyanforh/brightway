import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createManagementProvisioning, createManagementService } from "../src/modules/management/management-access.service.js";
test("database management bootstrap, audit rollback, fresh MFA and concurrent last-admin revocation stay safe", { skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database" }, async () => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const accounts = [], sessions = [], marker = randomUUID(), before = new Date(Date.now() - 10000);
  try {
    for (const label of ["first", "second", "ordinary"]) {
      const account = await db.account.create({ data: { username: `mg_${label}_${marker.replaceAll("-", "").slice(0, 12)}`, email: `mg_${label}_${marker}@example.invalid`, passwordHash: "synthetic-unusable-hash", emailVerifiedAt: before, person: { create: { firstName: "Synthetic", lastName: label } } } }); accounts.push(account);
      await db.mfaFactor.create({ data: { accountId: account.id, enabled: true, version: 1, encryptedSecret: "synthetic-no-real-secret", windowStart: before } });
      sessions.push(await db.session.create({ data: { accountId: account.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000), mfaVersion: 1, mfaVerifiedAt: before } }));
    }
    const [first, second, ordinary] = accounts, provision = createManagementProvisioning({ prisma: db }), service = createManagementService({ prisma: db });
    const grant = account => provision({ username: account.username, action: "grant", reason: "Establish isolated test management access." });
    const revoke = account => provision({ username: account.username, action: "revoke", reason: "Revoke isolated test management access." });
    function failAudit(client) { return new Proxy(client, { get(target, key) {
      if (key === "$transaction") return work => target.$transaction(tx => work(failAudit(tx)));
      if (key === "managementAdministratorAudit") return { create: async () => { throw Error("Injected management audit failure"); } };
      const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
    } }); }
    await assert.rejects(createManagementProvisioning({ prisma: failAudit(db) })({ username: first.username, action: "grant", reason: "Audit failure must roll back role creation." }), /Injected management audit failure/);
    assert.equal(await db.managementAdministrator.count({ where: { accountId: first.id } }), 0);
    const copies = await Promise.all([grant(first), grant(first)]); assert.equal(copies.filter(row => row.changed).length, 1);
    assert.equal(await db.managementAdministratorAudit.count({ where: { targetAccountId: first.id } }), 1);
    assert.deepEqual(await service.access(first.id, sessions[0].id), { allowed: false });
    await assert.rejects(service.context(first.id, sessions[0].id), { status: 403 });
    await db.session.update({ where: { id: sessions[0].id }, data: { mfaVerifiedAt: new Date() } });
    const context = await service.context(first.id, sessions[0].id); assert.equal(context.allowed, true); assert.equal(context.fullName, "Synthetic first"); assert.equal(context.tools.some(tool => tool.allowed), false);
    assert.equal((await db.account.findUnique({ where: { id: first.id } })).platformRole, "MEMBER");
    assert.deepEqual(await service.access(ordinary.id, sessions[2].id), { allowed: false });
    await assert.rejects(revoke(first), { status: 409 }); await grant(second);
    await db.account.update({ where: { id: second.id }, data: { status: "SUSPENDED" } }); await assert.rejects(revoke(first), { status: 409 });
    await db.account.update({ where: { id: second.id }, data: { status: "ACTIVE" } });
    const results = await Promise.allSettled([revoke(first), revoke(second)]); assert.equal(results.filter(row => row.status === "fulfilled").length, 1); assert.equal(results.find(row => row.status === "rejected").reason.status, 409);
    assert.equal(await db.managementAdministrator.count({ where: { accountId: { in: [first.id, second.id] }, enabled: true } }), 1);
    const revoked = await db.managementAdministrator.findFirst({ where: { accountId: { in: [first.id, second.id] }, enabled: false } });
    const index = accounts.findIndex(a => a.id === revoked.accountId); await assert.rejects(service.context(revoked.accountId, sessions[index].id), { status: 403 });
    assert.equal(await db.managementAdministratorAudit.count({ where: { targetAccountId: { in: accounts.map(a => a.id) } } }), 3);
    await grant(accounts[index]); assert.equal(await db.managementAdministratorAudit.count({ where: { targetAccountId: accounts[index].id } }), 3);
    // A regrant cannot reuse the old full session's MFA proof.
    await assert.rejects(service.context(accounts[index].id, sessions[index].id), { status: 403 });
  } finally {
    try {
      const ids = accounts.map(a => a.id);
      await db.managementAdministratorAudit.deleteMany({ where: { targetAccountId: { in: ids } } });
      await db.managementAdministrator.deleteMany({ where: { accountId: { in: ids } } });
      await db.session.deleteMany({ where: { accountId: { in: ids } } }); await db.mfaFactor.deleteMany({ where: { accountId: { in: ids } } });
      await db.account.deleteMany({ where: { id: { in: ids } } }); await db.person.deleteMany({ where: { id: { in: accounts.map(a => a.personId) } } });
    } finally { await db.$disconnect(); }
  }
});
