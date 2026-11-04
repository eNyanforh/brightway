import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { managementAuthFixture } from "../test-support/management-auth-fixture.js";
import { createManagementAuthRoutes, requireManagement, managementCookies } from "../src/modules/management/management-auth.http.js";
import { createRequireAuth } from "../src/modules/auth/session.http.js";
import { totp } from "../src/modules/auth/mfa.crypto.js";
async function appFixture(f) {
  const app = express(); app.use(express.json());
  app.use(createManagementAuthRoutes({ authentication: f.auth, clientUrl: "https://brightway.test", nodeEnv: "test", limiter: (r, s, n) => n() }));
  app.get("/internal", requireManagement(f.auth, "test"), (req, res) => res.json({ staffId: req.management.staff.id }));
  app.get("/personal", createRequireAuth({ cookieName: "brightway_session", sessions: { async authenticate(token) { if (token !== "personal-proof") throw Object.assign(Error("Sign in required"), { status: 401 }); return { account: { id: f.actors.owner.id } }; } } }), (req, res) => res.json({ accountId: req.auth.account.id }));
  app.use((error, req, res, next) => { void next; res.status(error.status || 500).json({ success: false, message: error.message }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
const headers = { Origin: "https://brightway.test", "Content-Type": "application/json" };
test("management HTTP enrollment uses a separate HttpOnly challenge and sends no full session before email and authenticator proof", async () => {
  const f = managementAuthFixture(); await f.provisioner.create(f.input("root"), null, true); const a = await appFixture(f);
  try {
    assert.equal((await fetch(a.base + "/management/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: "root", password: f.password }) })).status, 403);
    const response = await fetch(a.base + "/management/auth/login", { method: "POST", headers, body: JSON.stringify({ identifier: "root", password: f.password }) }); assert.equal(response.status, 200);
    const payload = await response.json(), pending = response.headers.getSetCookie().find(value => value.startsWith("brightway-management-pending="));
    assert(pending.includes("HttpOnly")); assert(pending.includes("SameSite=Strict")); assert(!response.headers.getSetCookie().some(value => /^brightway-management=[^;]/.test(value)));
    assert.equal(payload.data.challengeToken, undefined); assert.equal(payload.data.token, undefined); assert.equal(payload.data.emailCode, undefined);
    const cookie = pending.split(";")[0]; const code = totp(payload.data.secret, BigInt(Math.floor(+f.now() / 30000)));
    const verify = await fetch(a.base + "/management/auth/verify", { method: "POST", headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ code, emailCode: f.deliveries[0].code }) }); assert.equal(verify.status, 200);
    const result = await verify.json(); assert.equal(result.data.staff.realm, "management"); assert.equal(result.data.backupCodes.length, 10); assert.equal(result.data.token, undefined);
    assert(verify.headers.getSetCookie().some(value => /^brightway-management=[a-f0-9]{64};/.test(value) && value.includes("HttpOnly")));
    assert.equal((await fetch(a.base + "/management/auth/verify", { method: "POST", headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ code, emailCode: f.deliveries[0].code }) })).status, 401);
  } finally { await a.close(); }
});
test("cookies, tokens and authenticated principals cannot cross the personal/management boundary", async () => {
  const f = managementAuthFixture(), root = await f.enroll(), a = await appFixture(f);
  try {
    assert.equal((await fetch(a.base + "/internal", { headers: { Cookie: "brightway_session=personal-proof" } })).status, 401);
    assert.equal((await fetch(a.base + "/internal", { headers: { Cookie: "brightway-management=personal-proof" } })).status, 401);
    assert.equal((await fetch(a.base + "/personal", { headers: { Cookie: `brightway-management=${root.token}` } })).status, 401);
    assert.equal((await fetch(a.base + "/personal", { headers: { Cookie: `brightway_session=${root.token}` } })).status, 401);
    const management = await fetch(a.base + "/internal", { headers: { Cookie: `brightway_session=personal-proof; brightway-management=${root.token}` } }); assert.equal(management.status, 200); assert.equal((await management.json()).staffId, root.staff.id);
    const personal = await fetch(a.base + "/personal", { headers: { Cookie: `brightway_session=personal-proof; brightway-management=${root.token}` } }); assert.equal((await personal.json()).accountId, f.actors.owner.id);
    const me = await fetch(a.base + "/management/auth/me", { headers: { Cookie: `brightway-management=${root.token}` } }); assert.equal(me.headers.get("cache-control"), "no-store"); assert(!(await me.text()).includes("passwordHash"));
  } finally { await a.close(); }
});
test("unknown and registered recovery requests have the same public response and no returned code or token", async () => {
  const f = managementAuthFixture(); await f.enroll(); const a = await appFixture(f);
  try {
    const before = f.deliveries.length;
    const unknown = await fetch(a.base + "/management/auth/recovery/request", { method: "POST", headers, body: JSON.stringify({ email: "unknown@example.invalid" }) }); const u = await unknown.json(); assert.equal(f.deliveries.length, before);
    const known = await fetch(a.base + "/management/auth/recovery/request", { method: "POST", headers, body: JSON.stringify({ email: "root@management.example.invalid" }) }); assert.deepEqual(await known.json(), u); assert.equal(f.deliveries.length, before + 1);
    assert(unknown.headers.getSetCookie()[0].includes("HttpOnly")); assert(known.headers.getSetCookie()[0].includes("HttpOnly"));
  } finally { await a.close(); }
});
test("management production cookies have host-only secure names and never reuse personal cookies", () => {
  const c = managementCookies("production"); for (const name of [c.session, c.pending, c.recovery]) assert(name.startsWith("__Host-brightway-management"));
  assert.equal(c.options.secure, true); assert.equal(c.options.httpOnly, true); assert.equal(c.options.path, "/"); assert.equal(c.options.domain, undefined);
});
