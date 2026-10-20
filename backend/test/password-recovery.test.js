import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createPasswordResetService, resetAcknowledgement } from "../src/modules/auth/password-reset.service.js";
import { createPasswordResetRoutes, resetConfirmSchema, resetRequestSchema } from "../src/modules/auth/password-reset.routes.js";
import { createPasswordResetSender } from "../src/modules/auth/password-reset.sender.js";
import { recoveryFixture } from "../test-support/password-recovery-fixture.js";
const password = "  my new long passphrase  ";
test("recovery validates strict inputs and preserves password whitespace", () => {
  assert.deepEqual(resetRequestSchema.parse({ email: " Person@Example.com " }), { email: "person@example.com" });
  assert.equal(resetConfirmSchema.parse({ email: "person@example.com", code: "123456", password }).password, password);
  for (const input of [{ code: "1", password }, { code: "123456", password: "short" }, { code: "123456", password, accountId: "injected" }]) assert.equal(resetConfirmSchema.safeParse({ email: "person@example.com", ...input }).success, false);
});
test("reset proofs are private, purpose-bound, one use and revoke every account session", async () => {
  const f = recoveryFixture(), code = await f.issue();
  assert(!JSON.stringify(f.state.passwordResetChallenge).includes('"'+code+'"'));
  await f.recovery.confirm({ email: "person@example.com", code, password });
  assert.equal(f.state.account[0].passwordHash, `hashed:${password}`);
  assert.deepEqual(f.state.session.map((row) => row.id), ["other-session"]);
  assert.equal(f.state.passwordRecoveryAudit.length, 1);
  assert.equal(f.state.passwordRecoveryAudit[0].action, "PASSWORD_RESET_ALL_SESSIONS_REVOKED");
  await assert.rejects(f.recovery.confirm({ email: "person@example.com", code, password }), { status: 400 });
});
test("unknown, ineligible and throttled emails receive the same acknowledgement", async () => {
  const f = recoveryFixture();
  for (const email of ["person@example.com", "missing@example.com", "person@example.com"]) {
    const result = await f.recovery.request(email); assert.deepEqual(result.acknowledgement, resetAcknowledgement); await result.deliver();
  }
  assert.equal(f.messages.length, 1);
  f.advance(61000); f.state.account[0].status = "SUSPENDED";
  const result = await f.recovery.request("person@example.com"); await result.deliver();
  assert.deepEqual(result.acknowledgement, resetAcknowledgement); assert.equal(f.messages.length, 1);
});
test("expiry and five invalid guesses consume access without changing the password", async () => {
  const f = recoveryFixture(), code = await f.issue();
  for (let i = 0; i < 5; i++) await assert.rejects(f.recovery.confirm({ email: "person@example.com", code: "999999", password }), { status: 400 });
  assert.equal(f.state.passwordResetChallenge[0].attempts, 5);
  await assert.rejects(f.recovery.confirm({ email: "person@example.com", code, password }), { status: 400 });
  f.advance(61000); const fresh = await f.issue(); f.advance(600000);
  await assert.rejects(f.recovery.confirm({ email: "person@example.com", code: fresh, password }), { status: 400 });
  assert.equal(f.state.account[0].passwordHash, "old-hash");
});
test("resend invalidates the old proof and persistent hourly quotas survive service recreation", async () => {
  const f = recoveryFixture(), old = await f.issue(); f.advance(61000); const fresh = await f.issue();
  await assert.rejects(f.recovery.confirm({ email: "person@example.com", code: old, password }), { status: 400 });
  assert.notEqual(old, fresh);
  for (let i = 0; i < 4; i++) { f.advance(61000); const service = createPasswordResetService(f.options); const result = await service.request("person@example.com"); await result.deliver(); }
  assert.equal(f.messages.length, 5); assert.equal(f.state.passwordResetChallenge[0].requestCount, 5);
  f.advance(3600000); await f.issue(); assert.equal(f.messages.length, 6);
});
test("failed delivery never creates a usable proof and does not expose provider errors", async () => {
  const f = recoveryFixture(); f.failSend(); const result = await f.recovery.request("person@example.com");
  await result.deliver(); assert.deepEqual(result.acknowledgement, resetAcknowledgement);
  assert.equal(f.state.passwordResetChallenge[0].ready, false);
  await assert.rejects(f.recovery.confirm({ email: "person@example.com", code: "000001", password }), { status: 400 });
});
test("changed credentials and suspended accounts invalidate previously delivered proofs", async () => {
  for (const change of [{ passwordHash: "independently-changed" }, { status: "SUSPENDED" }]) {
    const f = recoveryFixture(), code = await f.issue(); Object.assign(f.state.account[0], change);
    await assert.rejects(f.recovery.confirm({ email: "person@example.com", code, password }), { status: 400 });
    assert.equal(f.state.passwordRecoveryAudit.length, 0);
  }
});
test("concurrent confirmations produce one winner; audit failures roll back password, proof and sessions", async () => {
  const f = recoveryFixture(), code = await f.issue();
  const results = await Promise.allSettled([1, 2].map(() => f.recovery.confirm({ email: "person@example.com", code, password })));
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(f.state.passwordRecoveryAudit.length, 1);
  const g = recoveryFixture(), second = await g.issue(); g.failAudit();
  await assert.rejects(g.recovery.confirm({ email: "person@example.com", code: second, password }));
  assert.equal(g.state.account[0].passwordHash, "old-hash"); assert.equal(g.state.session.length, 3); assert.equal(g.state.passwordResetChallenge[0].consumedAt, null);
});
test("HTTP recovery requires trusted Origin, has private responses and clears only the cookie after success", async (t) => {
  const f = recoveryFixture(), app = express(); app.use(express.json());
  app.use("/auth", createPasswordResetRoutes({ recovery: f.recovery, clientUrl: "https://brightway.test", nodeEnv: "production" }));
  app.use((error, req, res, next) => { void next; res.status(error.status ?? 500).json({ success: false, message: error.message }); });
  const server = app.listen(0); await new Promise((resolve) => server.once("listening", resolve)); t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/auth/password-reset`;
  async function post(path, body, origin) { return fetch(base+path, { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) }); }
  for (const origin of [undefined, "https://foreign.test"]) assert.equal((await post("/request", { email: "person@example.com" }, origin)).status, 403);
  const requested = await post("/request", { email: "Person@Example.com" }, "https://brightway.test");
  assert.equal(requested.headers.get("cache-control"), "no-store"); assert.equal(requested.headers.get("set-cookie"), null);
  assert.deepEqual((await requested.json()).data, resetAcknowledgement);
  // Delivery is deliberately detached from the HTTP acknowledgement.
  for (let i = 0; i < 20 && !f.state.passwordResetChallenge[0].ready; i++) await new Promise((resolve) => setTimeout(resolve, 5));
  const finished = await post("/confirm", { email: "person@example.com", code: f.messages[0].code, password }, "https://brightway.test");
  assert.equal(finished.status, 200); assert.match(finished.headers.get("set-cookie"), /__Host-brightway_session=;.*HttpOnly; Secure; SameSite=Lax/);
  assert(!JSON.stringify(await finished.json()).includes("hashed:"));
});
test("Resend reset messages have distinct purpose/idempotency and hide provider details", async () => {
  let sent;
  const sender = createPasswordResetSender({ apiKey: "test-key", from: "BrightWay <test@example.com>", fetcher: async (url, options) => { sent = options; return new Response(JSON.stringify({ id: "delivery" }), { status: 200 }); } });
  await sender.send({ email: "person@example.com", code: "123456", deliveryId: "id" });
  assert.equal(sent.headers["Idempotency-Key"], "password-reset/id"); assert.match(JSON.parse(sent.body).subject, /Reset/);
  await sender.notify({ email: "person@example.com", deliveryId: "id" });
  assert.equal(sent.headers["Idempotency-Key"], "password-reset-completed/id");
  assert(!JSON.parse(sent.body).text.includes("123456"));
  const failing = createPasswordResetSender({ apiKey: "test-key", from: "test@example.com", fetcher: async () => new Response("secret provider error", { status: 500 }) });
  await assert.rejects(failing.send({ email: "person@example.com", code: "123456", deliveryId: "id" }), (error) => error.status === 503 && !error.message.includes("secret"));
});
test("a code expiring during password hashing cannot change credentials or revoke sessions", async () => {
  const f = recoveryFixture();
  const service = createPasswordResetService({ ...f.options, hash: async () => { f.advance(600000); return "new-hash"; } });
  const issued = await service.request("person@example.com"); await issued.deliver();
  await assert.rejects(service.confirm({ email: "person@example.com", code: f.messages[0].code, password }), { status: 400 });
  assert.equal(f.state.account[0].passwordHash, "old-hash"); assert.equal(f.state.session.length, 3); assert.equal(f.state.passwordResetChallenge[0].consumedAt, null);
});
test("late delivery of an earlier code cannot reactivate it after a resend", async () => {
  const f = recoveryFixture(); let release;
  const pending = new Promise((resolve) => { release = resolve; }); let calls = 0;
  const service = createPasswordResetService({ ...f.options, sender: { check() {}, async send(message) { f.messages.push(message); if (++calls === 1) await pending; } } });
  const first = await service.request("person@example.com"); const delivering = first.deliver();
  f.advance(61000); const second = await service.request("person@example.com"); await second.deliver(); release(); await delivering;
  await assert.rejects(service.confirm({ email: "person@example.com", code: f.messages[0].code, password }), { status: 400 });
  await service.confirm({ email: "person@example.com", code: f.messages[1].code, password });
  assert.equal(f.state.passwordRecoveryAudit.length, 1);
});

test("failed completion notification does not undo a committed password reset", async () => {
  const f = recoveryFixture(); let notices = 0;
  const service = createPasswordResetService({ ...f.options, sender: { ...f.options.sender, async notify() { notices++; throw new Error("provider failure"); } } });
  const requested = await service.request("person@example.com"); await requested.deliver();
  const result = await service.confirm({ email: "person@example.com", code: f.messages[0].code, password });
  assert.match(result.message, /has been reset/); assert.equal(notices, 1); assert.equal(f.state.session.length, 1);
});

test("legacy accounts can recover through their mailbox without being marked email- or identity-verified", async () => {
  const f = recoveryFixture(); f.state.account[0].emailVerifiedAt = null;
  const code = await f.issue();
  await f.recovery.confirm({ email: "person@example.com", code, password });
  assert.equal(f.state.account[0].emailVerifiedAt, null);
  assert.equal(f.state.account[0].status, "ACTIVE");
});

test("unregistered emails never generate a reset code, receive an email or reset another account", async () => {
  const f = recoveryFixture(); let generated = 0;
  const service = createPasswordResetService({ ...f.options, code: () => { generated++; return "123456"; } });
  for (const email of ["missing@example.com", "person+missing@example.com", "other@example.net"]) {
    const result = await service.request(email); await result.deliver();
    assert.deepEqual(result.acknowledgement, resetAcknowledgement);
    await assert.rejects(service.confirm({ email, code: "123456", password }), { status: 400 });
  }
  assert.equal(generated, 0); assert.equal(f.messages.length, 0);
  assert(f.state.passwordResetChallenge.every((row) => row.accountId === null && row.ready === false));
  assert.equal(f.state.account[0].passwordHash, "old-hash"); assert.equal(f.state.passwordRecoveryAudit.length, 0);
  const registered = await service.request(" PERSON@EXAMPLE.COM "); await registered.deliver();
  assert.equal(generated, 1); assert.equal(f.messages.length, 1); assert.equal(f.messages[0].email, "person@example.com");
});
test("a code issued for a registered email cannot reset an unregistered email", async () => {
  const f = recoveryFixture(), code = await f.issue();
  await assert.rejects(f.recovery.confirm({ email: "unregistered@example.com", code, password }), { status: 400 });
  assert.equal(f.state.account[0].passwordHash, "old-hash");
  await f.recovery.confirm({ email: "person@example.com", code, password });
  assert.equal(f.state.passwordRecoveryAudit.length, 1);
});
test("delivery stops if the matching account was deleted, suspended or changed email before sending", async () => {
  for (const change of ["delete", "suspend", "email", "password"]) {
    const f = recoveryFixture(), requested = await f.recovery.request("person@example.com");
    if (change === "delete") f.state.account.length = 0;
    if (change === "suspend") f.state.account[0].status = "SUSPENDED";
    if (change === "email") f.state.account[0].email = "changed@example.com";
    if (change === "password") f.state.account[0].passwordHash = "changed-hash";
    await requested.deliver(); assert.equal(f.messages.length, 0); assert.equal(f.state.passwordResetChallenge[0].ready, false);
  }
});
test("an unrelated account lookup result cannot authorize sending a reset email", async () => {
  const f = recoveryFixture(); const lookup = f.db.account.findUnique;
  f.db.account.findUnique = async (args) => args.where.email === "unknown@example.com" ? structuredClone(f.state.account[0]) : lookup(args);
  const result = await f.recovery.request("unknown@example.com"); await result.deliver();
  assert.equal(f.messages.length, 0); assert.equal(f.state.passwordResetChallenge[0].accountId, null);
});
test("HTTP requests for unknown emails return only the generic acknowledgement and send no mail", async (t) => {
  const f = recoveryFixture(), app = express(); app.use(express.json());
  app.use("/auth", createPasswordResetRoutes({ recovery: f.recovery, clientUrl: "https://brightway.test", nodeEnv: "test" }));
  const server = app.listen(0); await new Promise((resolve) => server.once("listening", resolve)); t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/auth/password-reset`;
  const response = await fetch(base+"/request", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://brightway.test" }, body: JSON.stringify({ email: "unregistered@example.com" }) });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { success: true, data: resetAcknowledgement });
  assert.equal(f.messages.length, 0); assert.equal(f.state.passwordResetChallenge[0].accountId, null);
});
