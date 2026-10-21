import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { base32, totp, matchTotp, secretBox, fingerprint } from "../src/modules/auth/mfa.crypto.js";
import { createMfaService } from "../src/modules/auth/mfa.service.js";
import { createMfaRoutes } from "../src/modules/auth/mfa.routes.js";
import { createSessionRoutes } from "../src/modules/auth/session.routes.js";
import { createCredentialRoutes } from "../src/modules/credentials/credential.routes.js";
import { mfaFixture } from "../test-support/mfa-fixture.js";
test("TOTP matches RFC 6238 SHA-1 test vectors and base32 encodes known RFC 4648 examples", () => {
  for (const [input, expected] of [["f", "MY"], ["foo", "MZXW6"], ["foobar", "MZXW6YTBOI"]]) assert.equal(base32(Buffer.from(input)), expected);
  const secret = base32(Buffer.from("12345678901234567890"));
  for (const [seconds, expected] of [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"]]) assert.equal(totp(secret, BigInt(Math.floor(seconds / 30)), 8), expected);
  assert.equal(matchTotp(secret, "287082", new Date(59000)), 1n);
  assert.equal(matchTotp(secret, "287082", new Date(59000), 1n), null);
});
test("secret encryption uses fresh nonces and binds ciphertext to its account and key", () => {
  const box = secretBox("11".repeat(32)), secret = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const a = box.seal("owner", secret), b = box.seal("owner", secret);
  assert.notEqual(a, b); assert(!a.includes(secret)); assert.equal(box.open("owner", a), secret);
  assert.throws(() => box.open("foreign", a), { status: 503 });
  assert.throws(() => secretBox("22".repeat(32)).open("owner", a), { status: 503 });
  assert.throws(() => secretBox("bad").check(), { status: 503 });
});
test("enrollment requires password and a valid app code, encrypts the secret and gives one-time backup codes", async () => {
  const f = mfaFixture(); await assert.rejects(f.mfa.begin("account", "wrong"), { status: 401 });
  const setup = await f.mfa.begin("account", "correct password"); assert.equal(setup.secret.length, 32);
  const result = await f.mfa.enable("account", "current", f.currentCode(setup.secret));
  assert.equal(result.backupCodes.length, 10); assert.equal(new Set(result.backupCodes).size, 10);
  const factor = f.state.mfaFactor[0]; assert.equal(factor.enabled, true); assert(!factor.encryptedSecret.includes(setup.secret));
  assert(!JSON.stringify(factor.recoveryHashes).includes(result.backupCodes[0]));
  assert.equal(f.state.session.length, 1); assert.equal((await f.sessions.authenticate("a".repeat(64))).mfaVerified, true);
  await assert.rejects(f.sessions.authenticate("b".repeat(64)), { status: 401 });
  const status = await f.mfa.status("account"); assert.deepEqual(status, { enabled: true, backupCodesRemaining: 10 });
});
test("enabled accounts receive no full login session before the second factor and app codes cannot replay", async () => {
  const f = mfaFixture(), enrolled = await f.enroll(); f.advance(30000);
  const before = f.state.session.length;
  const challenge = await f.sessions.login({ identifier: "tester", password: "correct password" });
  assert.equal(challenge.mfaRequired, true); assert.equal(challenge.token, undefined); assert.equal(f.state.account[0].lastLoginAt, undefined); assert.equal(f.state.session.length, before);
  await assert.rejects(f.sessions.authenticate(challenge.challengeToken), { status: 401 });
  const session = await f.mfa.complete(challenge.challengeToken, f.currentCode(enrolled.secret));
  assert.equal((await f.sessions.authenticate(session.token)).mfaVerified, true); assert.equal(+f.state.account[0].lastLoginAt, +f.now());
  await assert.rejects(f.mfa.complete(challenge.challengeToken, f.currentCode(enrolled.secret)), { status: 401 });
  const second = await f.sessions.login({ identifier: "tester", password: "correct password" });
  await assert.rejects(f.mfa.complete(second.challengeToken, f.currentCode(enrolled.secret)), { status: 401 });
});
test("backup login consumes exactly one code and concurrent replay has only one winner", async () => {
  const f = mfaFixture(), enrolled = await f.enroll();
  const challenge = await f.sessions.login({ identifier: "tester", password: "correct password" });
  const outcomes = await Promise.allSettled([1, 2].map(() => f.mfa.complete(challenge.challengeToken, enrolled.backupCodes[0])));
  assert.equal(outcomes.filter((row) => row.status === "fulfilled").length, 1); assert.equal((await f.mfa.status("account")).backupCodesRemaining, 9);
  const next = await f.sessions.login({ identifier: "tester", password: "correct password" });
  await assert.rejects(f.mfa.complete(next.challengeToken, enrolled.backupCodes[0]), { status: 401 });
});
test("wrong-code counts commit and the account budget survives issuing fresh challenges", async () => {
  const f = mfaFixture(), enrolled = await f.enroll();
  const challenge = await f.sessions.login({ identifier: "tester", password: "correct password" });
  for (let i = 0; i < 5; i++) await assert.rejects(f.mfa.complete(challenge.challengeToken, "not-a-valid-proof"), { status: 401 });
  assert.equal(f.state.mfaLoginChallenge[0].attempts, 5);
  const fresh = await f.sessions.login({ identifier: "tester", password: "correct password" });
  await assert.rejects(f.mfa.complete(fresh.challengeToken, enrolled.backupCodes[0]), { status: 401 });
  f.advance(300000); const retry = await f.sessions.login({ identifier: "tester", password: "correct password" });
  assert((await f.mfa.complete(retry.challengeToken, enrolled.backupCodes[0])).token);
});
test("expired setup and login challenges, changed passwords and disabled factors cannot authorize a session", async () => {
  const pending = mfaFixture(), setup = await pending.mfa.begin("account", "correct password"); pending.advance(600000);
  await assert.rejects(pending.mfa.enable("account", "current", pending.currentCode(setup.secret)), { status: 401 });
  for (const change of ["expired", "password", "disabled", "suspended"]) {
    const f = mfaFixture(), enrolled = await f.enroll(); const challenge = await f.sessions.login({ identifier: "tester", password: "correct password" });
    if (change === "expired") f.advance(300000);
    if (change === "password") f.state.account[0].passwordHash = "new-hash";
    if (change === "disabled") f.state.mfaFactor[0].enabled = false;
    if (change === "suspended") f.state.account[0].status = "SUSPENDED";
    await assert.rejects(f.mfa.complete(challenge.challengeToken, enrolled.backupCodes[0]), { status: 401 });
  }
});
test("backup regeneration and disabling require password and fresh proof and invalidate other sessions", async () => {
  const f = mfaFixture(), enrolled = await f.enroll();
  await assert.rejects(f.mfa.change("account", "current", { password: "wrong", code: enrolled.backupCodes[0] }), { status: 401 });
  const changed = await f.mfa.change("account", "current", { password: "correct password", code: enrolled.backupCodes[0] });
  assert.equal(changed.backupCodes.length, 10); assert.notDeepEqual(changed.backupCodes, enrolled.backupCodes);
  const challenge = await f.sessions.login({ identifier: "tester", password: "correct password" });
  await assert.rejects(f.mfa.complete(challenge.challengeToken, enrolled.backupCodes[1]), { status: 401 });
  await f.mfa.change("account", "current", { password: "correct password", code: changed.backupCodes[0] }, true);
  assert.equal((await f.mfa.status("account")).enabled, false); assert.equal(f.state.mfaFactor[0].encryptedSecret, "");
  assert.equal((await f.sessions.authenticate("a".repeat(64))).mfaVerified, false);
});
test("factor/session version mismatch rejects stale sessions even when a cookie remains", async () => {
  const f = mfaFixture(); await f.enroll(); f.state.session[0].mfaVersion--;
  await assert.rejects(f.sessions.authenticate("a".repeat(64)), { status: 401 });
});
test("audit storage failure rolls back enable and backup-code consumption/session creation", async () => {
  const f = mfaFixture(); const setup = await f.mfa.begin("account", "correct password"); f.failAudit();
  await assert.rejects(f.mfa.enable("account", "current", f.currentCode(setup.secret)));
  assert.equal(f.state.mfaFactor[0].enabled, false); assert.equal(f.state.session.length, 2);
  const g = mfaFixture(), enrolled = await g.enroll(); const challenge = await g.sessions.login({ identifier: "tester", password: "correct password" }); g.failAudit();
  await assert.rejects(g.mfa.complete(challenge.challengeToken, enrolled.backupCodes[0]));
  assert.equal(g.state.mfaFactor[0].recoveryHashes.length, 10); assert.equal(g.state.mfaLoginChallenge[0].consumedAt, null);
});
test("missing server encryption key fails closed for enrolled login", async () => {
  const f = mfaFixture(); await f.enroll(); const mfa = createMfaService({ ...f.options, key: undefined });
  await assert.rejects(f.db.$transaction((tx) => mfa.challenge(tx, f.state.account[0], f.now())), { status: 503 });
});
test("HTTP second-step cookies are HttpOnly, no full session is sent early, Origin is required and role APIs reject non-MFA sessions", async (t) => {
  const f = mfaFixture(), enrolled = await f.enroll(); const app = express(); app.use(express.json());
  app.use("/auth", createMfaRoutes({ mfa: f.mfa, sessions: f.sessions, clientUrl: "https://brightway.test", nodeEnv: "production" }));
  app.use("/auth", createSessionRoutes({ sessions: f.sessions, clientUrl: "https://brightway.test", nodeEnv: "production" }));
  const ordinarySessions = { async authenticate() { return { mfaVerified: false, account: { id: "account", person: { id: "person" } } }; } };
  let queueReads = 0;
  app.use(createCredentialRoutes({ credentials: { async queue() { queueReads++; return { reviews: [] }; }, async ownsEvidence() { return false; } }, sessions: ordinarySessions, clientUrl: "https://brightway.test", nodeEnv: "production" }));
  app.use((error, req, res, next) => { void next; res.status(error.status ?? 500).json({ success: false, message: error.message }); });
  const server = app.listen(0); await new Promise((resolve) => server.once("listening", resolve)); t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, cookie, origin = "https://brightway.test") => fetch(base+path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const login = await post("/auth/login", { identifier: "tester", password: "correct password" }); const payload = await login.json();
  assert.deepEqual(payload.data, { mfaRequired: true });
  const header = login.headers.getSetCookie().find((value) => value.startsWith("__Host-brightway_mfa="));
  assert.match(header, /HttpOnly; Secure; SameSite=Lax/); const cookie = header.split(";")[0];
  assert.equal((await post("/auth/mfa/verify-login", { code: enrolled.backupCodes[0] }, cookie, "https://foreign.test")).status, 403);
  assert.equal((await post("/auth/mfa/verify-login", { code: enrolled.backupCodes[0], mfaVerified: true }, cookie)).status, 400);
  const success = await post("/auth/mfa/verify-login", { code: enrolled.backupCodes[0] }, cookie);
  assert.equal(success.status, 200); assert(success.headers.getSetCookie().some((value) => /^__Host-brightway_session=[a-f0-9]{64};/.test(value)));
  const returned = await success.json(); assert.equal(returned.data.account.id, "account"); assert(!JSON.stringify(returned).includes("backupCodes")); assert(!JSON.stringify(returned).includes("passwordHash")); assert(!JSON.stringify(returned).includes("encryptedSecret"));
  assert.equal((await fetch(base+"/admin/credentials")).status, 403); assert.equal(queueReads, 0);
  assert.equal((await fetch(base+"/credentials/evidence/11111111-1111-4111-8111-111111111111/download")).status, 403);
});
test("using the last backup code permits password-confirmed regeneration only in the recently verified session", async () => {
  const f = mfaFixture(), enrolled = await f.enroll();
  f.state.mfaFactor[0].recoveryHashes = f.state.mfaFactor[0].recoveryHashes.slice(0, 1);
  const pending = await f.sessions.login({ identifier: "tester", password: "correct password" });
  const completed = await f.mfa.complete(pending.challengeToken, enrolled.backupCodes[0]);
  const session = f.state.session.find((row) => row.tokenHash === fingerprint(completed.token));
  const codes = await f.mfa.change("account", session.id, { password: "correct password" });
  assert.equal(codes.backupCodes.length, 10);
  const g = mfaFixture(); await g.enroll(); g.state.mfaFactor[0].recoveryHashes = []; g.advance(300001);
  await assert.rejects(g.mfa.change("account", "current", { password: "correct password" }), { status: 401 });
});

test("logout cancels pending second-factor challenges as well as ordinary sessions", async () => {
  const f = mfaFixture(), enrolled = await f.enroll();
  const challenge = await f.sessions.login({ identifier: "tester", password: "correct password" });
  await f.sessions.logout(undefined, challenge.challengeToken);
  await assert.rejects(f.mfa.complete(challenge.challengeToken, enrolled.backupCodes[0]), { status: 401 });
  assert.equal(f.state.mfaLoginChallenge.length, 0);
});

test("password-confirmed backup regeneration retries cannot extend the recent-MFA window", async () => {
  const f = mfaFixture(); await f.enroll(); const originalProofTime = +f.state.session[0].mfaVerifiedAt;
  f.advance(240000); await f.mfa.change("account", "current", { password: "correct password" });
  assert.equal(+f.state.session[0].mfaVerifiedAt, originalProofTime);
  assert.equal((await f.mfa.status("account", "current")).canRegenerateWithPassword, true);
  f.advance(60001); await assert.rejects(f.mfa.change("account", "current", { password: "correct password" }), { status: 401 });
});
