import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { createNetworkRoutes } from "../src/modules/network/network.routes.js";
import { networkActionSchema, networkQuerySchema, relationshipView } from "../src/modules/network/network.schema.js";
test("network inputs reject forged actors, trust flags, unknown actions and unsafe cursors", () => {
  const value = { action: "REQUEST", expectedVersion: 0, requestKey: randomUUID() };
  assert(networkActionSchema.safeParse(value).success);
  for (const body of [{ ...value, accountId: randomUUID() }, { ...value, connected: true }, { ...value, status: "CONNECTED" }, { ...value, action: "VERIFY" }, { ...value, expectedVersion: -1 }, { ...value, requestKey: "unsafe" }]) assert(!networkActionSchema.safeParse(body).success);
  for (const query of [{ connected: "true" }, { view: "all-users" }, { cursor: "x".repeat(701) }]) assert(!networkQuerySchema.safeParse(query).success);
  const row = { leftAccountId: "one", rightAccountId: "two", leftBlocked: false, rightBlocked: true, status: "NONE", version: 3 };
  assert.throws(() => relationshipView(row, "one"), { status: 404 });
  assert.equal(relationshipView(row, "two").state, "BLOCKED");
});
test("network HTTP requires a personal cookie and trusted Origin, binds server identity and returns private sanitized responses", async () => {
  const actorId = randomUUID(), sessionId = randomUUID(), personId = randomUUID(); let writes = 0, failure = false;
  const network = {
    async list(actor) { assert.deepEqual(actor, { accountId: actorId, sessionId }); return { view: "connections", items: [], nextCursor: null }; },
    async person() { if (failure) throw Error("private-db-host-password"); return { person: { username: "target" }, relationship: { state: "NONE", version: 0 } }; },
    async visibleContact(username, viewer) { assert.equal(viewer, personId); return {}; },
    async action(actor) { assert.equal(actor.accountId, actorId); writes++; return { saved: true }; },
  };
  const sessions = { async authenticate(token) { if (token !== "personal-token") throw Object.assign(Error("Personal sign-in required."), { status: 401 }); return { account: { id: actorId, person: { id: personId } }, sessionId }; } };
  const app = express(); app.use(express.json()); app.use(createNetworkRoutes({ network, sessions, clientUrl: "http://localhost:5173", nodeEnv: "test", limiter: (req, res, next) => next() }));
  app.use((error, req, res, next) => { void next; res.status(error.status || 500).json({ success: false, message: error.message }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); const base = `http://127.0.0.1:${server.address().port}/network`;
  const headers = { Cookie: "brightway_session=personal-token", Origin: "http://localhost:5173", "Content-Type": "application/json" };
  try {
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(base, { headers: { Cookie: "brightway-management=management-token" } })).status, 401);
    const list = await fetch(base, { headers }); assert.equal(list.status, 200); assert.equal(list.headers.get("cache-control"), "no-store");
    assert.equal((await fetch(base + "/people/target/contact", { headers })).status, 200);
    for (const origin of [null, "https://foreign.invalid"]) {
      const h = { ...headers }; if (origin) h.Origin = origin; else delete h.Origin;
      assert.equal((await fetch(base + "/people/target/actions", { method: "POST", headers: h, body: "{}" })).status, 403);
    }
    assert.equal(writes, 0);
    assert.equal((await fetch(base + "/people/target/actions?owner=true", { method: "POST", headers, body: "{}" })).status, 400);
    assert.equal((await fetch(base + "/people/target/actions", { method: "POST", headers, body: "{}" })).status, 200); assert.equal(writes, 1);
    failure = true; const broken = await fetch(base + "/people/target", { headers }); assert.equal(broken.status, 503); assert(!(await broken.text()).includes("private-db"));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
