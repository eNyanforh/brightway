import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { createNetworkRoutes } from "../src/modules/network/network.routes.js";
import { followActionSchema, followRef } from "../src/modules/network/network-follow.schema.js";
import { parse } from "../src/modules/network/network.schema.js";
test("follow commands bind an explicit target and reject injected roles, unknown fields and malformed versions", () => {
  const input = { action: "FOLLOW", expectedVersion: 0, requestKey: randomUUID(), targetRef: followRef("PERSON", randomUUID()) };
  assert(followActionSchema.safeParse(input).success);
  for (const extra of [{ followerId: randomUUID() }, { permissions: ["superadmin"] }, { connected: true }, { status: "VERIFIED" }, { action: "ACCEPT" }, { expectedVersion: -1 }, { targetRef: "forged" }, { requestKey: "invalid" }]) assert(!followActionSchema.safeParse({ ...input, ...extra }).success);
  assert.notEqual(followRef("PERSON", "same"), followRef("ORGANIZATION", "same"));
});
test("follow HTTP isolates personal sign-in, trusted Origin, typed targets, strict bodies and sanitized private responses", async () => {
  const id = randomUUID(), sessionId = randomUUID(); let writes = 0, kind, failure = false;
  const following = { async target(actor, type, username) { assert.equal(actor.accountId, id); kind = type; assert.equal(username, "school"); if (failure) throw Error("sensitive-database-password"); return { kind: type }; }, async action(actor, type, username, body) { parse(followActionSchema, body); assert.equal(actor.sessionId, sessionId); writes++; return { saved: true }; } };
  const sessions = { async authenticate(token) { if (token !== "personal") throw Object.assign(Error("Sign in again"), { status: 401 }); return { sessionId, account: { id, person: { id: randomUUID() } } }; } };
  const app = express(); app.use(express.json()); app.use(createNetworkRoutes({ network: {}, following, sessions, clientUrl: "http://localhost:5173", nodeEnv: "test", limiter: (req, res, next) => next() })); app.use((error, req, res, next) => { void next; res.status(error.status || 500).json({ success: false, message: error.message }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); const url = `http://127.0.0.1:${server.address().port}/network/follows/organizations/school`;
  const headers = { Cookie: "brightway_session=personal", Origin: "http://localhost:5173", "Content-Type": "application/json" }, body = { action: "FOLLOW", expectedVersion: 0, requestKey: randomUUID(), targetRef: followRef("ORGANIZATION", randomUUID()) };
  try {
    assert.equal((await fetch(url)).status, 401); assert.equal((await fetch(url, { headers: { Cookie: "brightway-management=mg-token" } })).status, 401);
    const ok = await fetch(url, { headers }); assert.equal(ok.status, 200); assert.equal(kind, "ORGANIZATION"); assert.equal(ok.headers.get("cache-control"), "no-store");
    assert.equal((await fetch(url + "?owner=other", { headers })).status, 400);
    assert.equal((await fetch(url.replace("organizations", "admins"), { headers })).status, 400);
    assert.equal((await fetch(url + "/actions", { method: "POST", headers: { ...headers, Origin: "https://foreign.invalid" }, body: JSON.stringify(body) })).status, 403);
    assert.equal((await fetch(url + "/actions", { method: "POST", headers, body: JSON.stringify({ ...body, connected: true }) })).status, 400); assert.equal(writes, 0);
    assert.equal((await fetch(url + "/actions", { method: "POST", headers, body: JSON.stringify(body) })).status, 200); assert.equal(writes, 1);
    failure = true; const failed = await fetch(url, { headers }); assert.equal(failed.status, 503); assert(!(await failed.text()).includes("sensitive-database"));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
