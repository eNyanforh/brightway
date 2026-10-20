import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPasswordResetService } from "../src/modules/auth/password-reset.service.js";
import { createSessionService } from "../src/modules/auth/session.service.js";
test("database reset has one concurrent winner and prevents a stale-password login from recreating a session", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const marker = randomUUID().replaceAll("-", "").slice(0, 12), email = `reset_${marker}@example.com`;
  let account;
  try {
    account = await prisma.account.create({ data: { email, username: `reset_${marker}`, passwordHash: "old-hash", emailVerifiedAt: new Date(), person: { create: { firstName: "Reset", lastName: marker } } } });
    await prisma.session.create({ data: { accountId: account.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } });
    let delivered;
    const recovery = createPasswordResetService({ prisma, secret: "test-secret-with-at-least-32-characters", sender: { check() {}, async send(message) { delivered = message; } }, hash: async (password) => `hash:${password}` });
    const requested = await recovery.request(email); await requested.deliver();
    const challenge = await prisma.passwordResetChallenge.findFirst({ where: { accountId: account.id } });
    assert.equal(challenge.ready, true); assert.notEqual(challenge.codeHash, delivered.code);
    let entered, release;
    const checking = new Promise((resolve) => { entered = resolve; });
    const resume = new Promise((resolve) => { release = resolve; });
    const sessions = createSessionService({ prisma, verify: async () => { entered(); await resume; return true; } });
    const login = sessions.login({ identifier: email, password: "old password" });
    // Attach the rejection handler before deliberately resuming the pending login.
    const rejectedLogin = assert.rejects(login, { status: 401 });
    await checking;
    try {
      const results = await Promise.allSettled([1, 2].map(() => recovery.confirm({ email, code: delivered.code, password: "my new long passphrase" })));
      assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
    } finally { release(); }
    await rejectedLogin;
    assert.equal(await prisma.session.count({ where: { accountId: account.id } }), 0);
    assert.equal(await prisma.passwordRecoveryAudit.count({ where: { accountId: account.id } }), 1);
    assert.equal((await prisma.account.findUnique({ where: { id: account.id } })).passwordHash, "hash:my new long passphrase");
    await assert.rejects(recovery.confirm({ email, code: delivered.code, password: "a second long passphrase" }), { status: 400 });
  } finally {
    try {
      if (account) {
        await prisma.passwordResetChallenge.deleteMany({ where: { accountId: account.id } });
        await prisma.passwordRecoveryAudit.deleteMany({ where: { accountId: account.id } });
        await prisma.session.deleteMany({ where: { accountId: account.id } });
        await prisma.account.delete({ where: { id: account.id } });
        await prisma.person.delete({ where: { id: account.personId } });
      }
    } finally { await prisma.$disconnect(); }
  }
});
