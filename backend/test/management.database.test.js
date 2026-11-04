import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createManagementProvisioner } from "../src/modules/management/management-provisioning.js";
import { createManagementAuth } from "../src/modules/management/management-auth.service.js";
import { createManagementService } from "../src/modules/management/management-access.service.js";
import { totp } from "../src/modules/auth/mfa.crypto.js";
import { hashPassword } from "../src/modules/auth/password.js";
import { cleanupManagementFixtures } from "../test-support/management-database-fixture.js";

test("database independent management enrollment, concurrent backup consumption, recovery and terminal authority preserve realm isolation", { skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database" }, async () => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const ids = [], marker = randomUUID().replaceAll("-", "").slice(0, 12), deliveries = [], password = "Synthetic independent management password";
  let time = new Date(); const now = () => time;
  const provision = createManagementProvisioner({ prisma: db, now }), management = createManagementService({ prisma: db, now });
  const auth = createManagementAuth({ prisma: db, key: "ab".repeat(32), emailSecret: "synthetic-management-email-key-32-characters", sender: { check() {}, async send(input) { deliveries.push(input); } }, now });
  const hash = await hashPassword(password), before = await db.account.count();
  const input = label => ({ username: `mg_${label}_${marker}`, email: `${label}_${marker}@management.example.invalid`, fullName: `Synthetic ${label}`, passwordHash: hash, reason: "Isolated management authentication acceptance." });
  async function enroll(staff) {
    const pending = await auth.login({ identifier: staff.username, password });
    const code = totp(pending.secret, BigInt(Math.floor(+time / 30000)));
    return auth.complete(pending.challengeToken, { code, emailCode: deliveries.at(-1).code });
  }
  try {
    const roots = await Promise.allSettled([provision.create(input("first"), null, true), provision.create(input("second"), null, true)]);
    assert.equal(roots.filter(row => row.status === "fulfilled").length, 1);
    assert.equal(roots.find(row => row.status === "rejected").reason.status, 409);
    const root = roots.find(row => row.status === "fulfilled").value; ids.push(root.id);
    assert.equal(await db.account.count(), before, "bootstrap must never create an ordinary account");
    assert.equal((await db.reviewPrincipal.findUnique({ where: { id: root.id } })).staffId, root.id);
    const enabled = await enroll(root); assert.equal(enabled.backupCodes.length, 10);
    const signed = await auth.authenticate(enabled.token), actor = { staffId: root.id, sessionId: signed.sessionId };
    assert((await management.context(root.id, signed.sessionId)).tools.every(tool => tool.allowed));
    const child = await provision.create(input("staff"), actor); ids.push(child.id);
    await enroll(child);
    await provision.change({ username: child.username, capability: "organization-agent", enabled: true, reason: "Assign an explicit scoped investigation capability." }, actor);
    const childChallenge = await auth.login({ identifier: child.username, password });
    // Recovery and login proofs cannot be substituted for each other.
    const rootChallenge = await auth.login({ identifier: root.username, password });
    const use = () => auth.complete(rootChallenge.challengeToken, { code: enabled.backupCodes[0] });
    const races = await Promise.allSettled([use(), use()]); assert.equal(races.filter(row => row.status === "fulfilled").length, 1);
    assert.equal((await db.managementStaff.findUnique({ where: { id: root.id } })).recoveryHashes.length, 9);
    const emailCount = deliveries.length; await auth.requestRecovery(`unknown_${marker}@example.invalid`); assert.equal(deliveries.length, emailCount);
    const recovery = await auth.requestRecovery(input("first").username === root.username ? input("first").email : input("second").email);
    await assert.rejects(auth.complete(recovery.challengeToken, { code: enabled.backupCodes[1] }), { status: 401 });
    await assert.rejects(auth.reset(childChallenge.challengeToken, { password: "Another synthetic password", code: enabled.backupCodes[1], emailCode: deliveries.at(-1).code }), { status: 401 });
    const emailCode = deliveries.at(-1).code;
    await assert.rejects(auth.reset(recovery.challengeToken, { password: "Another synthetic password", code: "invalid", emailCode }), { status: 401 });
    assert.equal((await db.managementStaff.findUnique({ where: { id: root.id } })).failureCount, 1);
    await auth.reset(recovery.challengeToken, { password: "Another synthetic password", code: enabled.backupCodes[1], emailCode });
    await assert.rejects(auth.authenticate(enabled.token), { status: 401 });
    assert.equal(await db.managementSession.count({ where: { staffId: root.id } }), 0);
    assert.equal(await db.account.count(), before);
    time = new Date(+time + 600001);
    await assert.rejects(provision.create(input("late"), actor), { status: 403 });
  } finally {
    try { await cleanupManagementFixtures(db, ids); } finally { await db.$disconnect(); }
  }
});
