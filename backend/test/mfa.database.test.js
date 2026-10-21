import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createMfaService } from "../src/modules/auth/mfa.service.js";
import { createSessionService, tokenHash } from "../src/modules/auth/session.service.js";
import { createPasswordResetService } from "../src/modules/auth/password-reset.service.js";
import { hashPassword } from "../src/modules/auth/password.js";
import { totp } from "../src/modules/auth/mfa.crypto.js";
test("database MFA enrollment, concurrent backup-code use and password reset preserve second-factor enforcement", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const marker = randomUUID().replaceAll("-", "").slice(0, 12), email = `mfa_${marker}@example.com`, password = "My long test-only passphrase!";
  let account;
  try {
    account = await prisma.account.create({ data: { username: `mfa_${marker}`, email, emailVerifiedAt: new Date(), passwordHash: await hashPassword(password), person: { create: { firstName: "MFA", lastName: marker } } } });
    const mfa = createMfaService({ prisma, key: "11".repeat(32) }), sessions = createSessionService({ prisma, mfa });
    const current = await sessions.login({ identifier: email, password }), older = await sessions.login({ identifier: email, password });
    const session = await prisma.session.findUnique({ where: { tokenHash: tokenHash(current.token) } });
    const setup = await mfa.begin(account.id, password);
    const enabled = await mfa.enable(account.id, session.id, totp(setup.secret, BigInt(Math.floor(Date.now() / 30000))));
    assert.equal(enabled.backupCodes.length, 10);
    assert.equal((await sessions.authenticate(current.token)).mfaVerified, true);
    await assert.rejects(sessions.authenticate(older.token), { status: 401 });
    const pending = await sessions.login({ identifier: email, password });
    assert.equal(pending.token, undefined);
    const results = await Promise.allSettled([1, 2].map(() => mfa.complete(pending.challengeToken, enabled.backupCodes[0])));
    assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
    assert.equal((await mfa.status(account.id)).backupCodesRemaining, 9);
    const verified = results.find((row) => row.status === "fulfilled").value;
    assert.equal((await sessions.authenticate(verified.token)).mfaVerified, true);
    const interrupted = await sessions.login({ identifier: email, password });
    let delivered;
    const recovery = createPasswordResetService({ prisma, secret: "test-reset-secret-at-least-32-characters", sender: { check() {}, async send(message) { delivered = message; } } });
    const requested = await recovery.request(email); await requested.deliver();
    const newPassword = "My changed test-only passphrase!";
    await recovery.confirm({ email, code: delivered.code, password: newPassword });
    assert.equal((await mfa.status(account.id)).enabled, true);
    await assert.rejects(mfa.complete(interrupted.challengeToken, enabled.backupCodes[1]), { status: 401 });
    await assert.rejects(sessions.authenticate(verified.token), { status: 401 });
    const afterReset = await sessions.login({ identifier: email, password: newPassword });
    assert.equal(afterReset.mfaRequired, true); assert.equal(afterReset.token, undefined);
    const final = await mfa.complete(afterReset.challengeToken, enabled.backupCodes[1]);
    assert.equal((await sessions.authenticate(final.token)).mfaVerified, true);
    const stored = await prisma.mfaFactor.findUnique({ where: { accountId: account.id } });
    assert(!stored.encryptedSecret.includes(setup.secret)); assert.equal(stored.recoveryHashes.length, 8);
    assert.equal(await prisma.mfaAudit.count({ where: { accountId: account.id, action: "LOGIN_VERIFIED" } }), 2);
  } finally {
    try {
      if (account) {
        await prisma.mfaLoginChallenge.deleteMany({ where: { accountId: account.id } });
        await prisma.mfaFactor.deleteMany({ where: { accountId: account.id } });
        await prisma.mfaAudit.deleteMany({ where: { accountId: account.id } });
        await prisma.passwordResetChallenge.deleteMany({ where: { accountId: account.id } });
        await prisma.passwordRecoveryAudit.deleteMany({ where: { accountId: account.id } });
        await prisma.session.deleteMany({ where: { accountId: account.id } });
        await prisma.account.delete({ where: { id: account.id } }); await prisma.person.delete({ where: { id: account.personId } });
      }
    } finally { await prisma.$disconnect(); }
  }
});
