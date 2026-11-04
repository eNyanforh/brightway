import test from "node:test";
import assert from "node:assert/strict";
import { managementAuthFixture } from "../test-support/management-auth-fixture.js";
import { createManagementAuth, managementTokenHash } from "../src/modules/management/management-auth.service.js";
import { totp, fingerprint } from "../src/modules/auth/mfa.crypto.js";
import { assertManagementSession } from "../src/modules/management/management-authority.js";
const code = f => totp(f.secret, BigInt(Math.floor(+f.now() / 30000)));
test("management bootstrap/enrollment creates no personal account, verifies email/MFA, encrypts its independent secret and displays backups once", async () => {
  const f = managementAuthFixture(), before = f.state.account.length;
  await f.provisioner.create(f.input("founder"), null, true);
  const pending = await f.auth.login({ identifier: "founder", password: f.password });
  assert.equal(pending.step, "enroll"); assert.equal(f.state.managementSession.length, 0); assert.equal(f.state.account.length, before);
  const input = { code: totp(pending.secret, BigInt(Math.floor(+f.now() / 30000))), emailCode: f.deliveries[0].code };
  await assert.rejects(f.auth.complete(pending.challengeToken, { ...input, emailCode: "wrong" }), { status: 401 });
  const result = await f.auth.complete(pending.challengeToken, input); assert.equal(result.backupCodes.length, 10);
  const row = f.state.managementStaff[0]; assert.equal(row.status, "ACTIVE"); assert(row.emailVerifiedAt); assert(!row.encryptedSecret.includes(pending.secret)); assert(!row.recoveryHashes.includes(result.backupCodes[0]));
  assert.equal((await f.auth.authenticate(result.token)).realm, "management");
  await assert.rejects(f.auth.complete(pending.challengeToken, input), { status: 401 });
});
test("personal credentials/tokens and wrong-purpose proofs cannot authenticate a management session", async () => {
  const f = managementAuthFixture(); const root = await f.enroll();
  await assert.rejects(f.auth.login({ identifier: f.actors.owner.username, password: f.password }), { status: 401 });
  const ordinary = "1".repeat(64); f.state.session.push({ tokenHash: fingerprint(ordinary), accountId: f.actors.owner.id, expiresAt: new Date(+f.now() + 100000) });
  await assert.rejects(f.auth.authenticate(ordinary), { status: 401 });
  await assert.rejects(f.auth.complete(root.token, { code: root.backupCodes[0] }), { status: 401 });
  assert.notEqual(managementTokenHash(root.token), fingerprint(root.token));
});
test("enabled staff receive no session before management MFA and concurrent backup-code replay has one winner", async () => {
  const f = managementAuthFixture(), root = await f.enroll();
  const challenge = await f.auth.login({ identifier: "root", password: f.password }); const sessions = f.state.managementSession.length;
  assert.equal(challenge.step, "mfa"); assert.equal(f.state.managementSession.length, sessions);
  const results = await Promise.allSettled([f.auth.complete(challenge.challengeToken, { code: root.backupCodes[0] }), f.auth.complete(challenge.challengeToken, { code: root.backupCodes[0] })]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(f.state.managementStaff[0].recoveryHashes.length, 9);
});
test("wrong-code budgets commit across newly issued management challenges and expired/changed proofs cannot log in", async () => {
  const f = managementAuthFixture(); await f.enroll();
  for (let i = 0; i < 5; i++) { const pending = await f.auth.login({ identifier: "root", password: f.password }); await assert.rejects(f.auth.complete(pending.challengeToken, { code: "invalid" }), { status: 401 }); }
  assert.equal(f.state.managementStaff[0].failureCount, 5); await assert.rejects(f.auth.login({ identifier: "root", password: f.password }), { status: 401 });
  f.advance(300001); const next = await f.auth.login({ identifier: "root", password: f.password }); f.advance(600001);
  await assert.rejects(f.auth.complete(next.challengeToken, { code: "000000" }), { status: 401 });
});
test("unknown management email receives no recovery message; registered recovery requires both email and existing MFA and revokes prior sessions", async () => {
  const f = managementAuthFixture(), root = await f.enroll(), before = f.deliveries.length;
  assert.deepEqual(await f.auth.requestRecovery("not-registered@example.invalid"), { accepted: true }); assert.equal(f.deliveries.length, before);
  const recovery = await f.auth.requestRecovery("root@management.example.invalid"), emailCode = f.deliveries.at(-1).code;
  await assert.rejects(f.auth.complete(recovery.challengeToken, { code: root.backupCodes[0] }), { status: 401 });
  await assert.rejects(f.auth.reset(recovery.challengeToken, { password: "new management password", emailCode, code: "invalid" }), { status: 401 });
  const result = await f.auth.reset(recovery.challengeToken, { password: "new management password", emailCode, code: root.backupCodes[0] }); assert.equal(result.reset, true);
  assert.equal(f.state.managementStaff[0].recoveryHashes.length, 9); assert.equal(f.state.managementSession.length, 0);
  await assert.rejects(f.auth.authenticate(root.token), { status: 401 }); await assert.rejects(f.auth.login({ identifier: "root", password: f.password }), { status: 401 });
  await assert.rejects(f.auth.reset(recovery.challengeToken, { password: "another management password", emailCode, code: root.backupCodes[1] }), { status: 401 });
});
test("backup regeneration checks password/recent MFA, preserves the recent-proof window and invalidates previous codes and other sessions", async () => {
  const f = managementAuthFixture(), root = await f.enroll(), session = f.state.managementSession[0], verifiedAt = +session.mfaVerifiedAt;
  const a = await f.auth.regenerate(root.staff.id, session.id, { password: f.password }); assert.equal(a.backupCodes.length, 10); assert.equal(+f.state.managementSession[0].mfaVerifiedAt, verifiedAt);
  f.advance(300001); await assert.rejects(f.auth.regenerate(root.staff.id, session.id, { password: f.password }), { status: 403 });
  await assert.rejects(f.auth.regenerate(root.staff.id, session.id, { password: f.password, code: root.backupCodes[0] }), { status: 401 });
  const b = await f.auth.regenerate(root.staff.id, session.id, { password: f.password, code: a.backupCodes[0] }); assert.equal(b.backupCodes.length, 10);
});
test("audit failure rolls back factor consumption, session creation and management enrollment", async () => {
  const f = managementAuthFixture(), root = await f.enroll(), pending = await f.auth.login({ identifier: "root", password: f.password });
  const original = f.db.managementStaffAudit.create; f.db.managementStaffAudit.create = async () => { throw Error("Audit unavailable"); };
  const before = f.state.managementSession.length; await assert.rejects(f.auth.complete(pending.challengeToken, { code: root.backupCodes[0] }), /Audit unavailable/);
  assert.equal(f.state.managementStaff[0].recoveryHashes.length, 10); assert.equal(f.state.managementSession.length, before);
  f.db.managementStaffAudit.create = original; await f.auth.complete(pending.challengeToken, { code: root.backupCodes[0] });
});
test("missing management encryption/email configuration and provider failure fail closed without activating staff", async () => {
  const f = managementAuthFixture(); await f.provisioner.create(f.input("root"), null, true);
  for (const config of [{ key: undefined }, { emailSecret: "short" }]) await assert.rejects(createManagementAuth({ ...f.config, ...config }).login({ identifier: "root", password: f.password }), { status: 503 });
  f.sender.send = async () => { throw Error("Provider private diagnostic"); };
  await assert.rejects(f.auth.login({ identifier: "root", password: f.password }), { status: 503 });
  assert.equal(f.state.managementStaff[0].status, "PENDING"); assert.equal(f.state.managementSession.length, 0); assert(f.state.managementChallenge[0].consumedAt);
});
test("management session versions and current status immediately reject revoked staff", async () => {
  const f = managementAuthFixture(), root = await f.enroll();
  const auth = await f.auth.authenticate(root.token); await assertManagementSession(f.db, root.staff.id, auth.sessionId, f.now());
  f.state.managementStaff[0].version++; await assert.rejects(f.auth.authenticate(root.token), { status: 401 });
  await assert.rejects(assertManagementSession(f.db, root.staff.id, auth.sessionId, f.now()), { status: 403 });
});

test("management step-up requires password and fresh single-use MFA, retains session expiry, and commits failure budgets", async () => {
  const f = managementAuthFixture(), root = await f.enroll(); f.secret = root.secret; f.advance(360000);
  const actor = await f.auth.authenticate(root.token), before = f.state.managementSession.find(row => row.id === actor.sessionId).expiresAt;
  await assert.rejects(f.auth.stepUp(root.staff.id,actor.sessionId,{ password:"wrong",code:code(f) }),{ status:400 });
  assert.equal(f.state.managementStaff[0].failureCount,1);
  await f.auth.stepUp(root.staff.id,actor.sessionId,{ password:f.password,code:code(f) });
  assert.equal(+f.state.managementSession.find(row => row.id === actor.sessionId).expiresAt,+before);
  await assertManagementSession(f.db,root.staff.id,actor.sessionId,f.now(),true);
  await assert.rejects(f.auth.stepUp(root.staff.id,actor.sessionId,{ password:f.password,code:code(f) }),{ status:400 });
  assert.equal(f.state.managementStaff[0].failureCount,1);
  for (let i=0;i<4;i++) await assert.rejects(f.auth.stepUp(root.staff.id,actor.sessionId,{ password:"wrong",code:"000000" }),{ status:400 });
  f.advance(30000); await assert.rejects(f.auth.stepUp(root.staff.id,actor.sessionId,{ password:f.password,code:code(f) }),{ status:400 });
});
