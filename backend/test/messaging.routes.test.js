import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createMessagingRoutes } from "../src/modules/messaging/messaging.routes.js";
const id = "33333333-3333-4333-8333-333333333333";
const origin = "http://localhost:5173";
test("messaging HTTP rejects cross-origin writes and impersonation; live streams emit typed events and close when authority changes", async () => {
  let opened = 0, snapshots = 0, revoked = false;
  const actor = { account: { id }, sessionId: id };
  const sessions = { authenticate: async token => { if (token !== "valid") throw Object.assign(Error("Sign in"), { status: 401 }); return actor; } };
  const messaging = {
    async open(a, username) { assert.deepEqual(a, { accountId: id, sessionId: id }); opened++; return { id, username }; },
    async snapshot() { if (revoked) throw Object.assign(Error("Revoked"), { status: 401 }); snapshots++; const n = snapshots > 1 ? "b" : "a"; return { messages: n, read: n, delivered: n, presence: { active: true, typing: snapshots > 1 } }; },
  };
  const app = express(); app.use(express.json());
  app.use(createMessagingRoutes({ messaging, notifications: { list: async () => ({ items: [] }) }, sessions, clientUrl: origin, nodeEnv: "test", limiter: (_r, _s, next) => next(), pollIntervalMs: 20 }));
  app.use((e, _req, res, _next) => res.status(e.status || 500).json({ message: e.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Cookie: "brightway_session=valid", Origin: origin, "Content-Type": "application/json" };
  try {
    assert.equal((await fetch(base + "/messaging/conversations", { method: "POST", headers: { ...headers, Origin: "https://evil.invalid" }, body: JSON.stringify({ username: "alice" }) })).status, 403);
    assert.equal(opened, 0);
    assert.equal((await fetch(base + "/messaging/conversations", { method: "POST", headers, body: JSON.stringify({ username: "alice", senderAccountId: id }) })).status, 400);
    assert.equal((await fetch(base + "/messaging/conversations", { method: "POST", headers, body: JSON.stringify({ username: "alice" }) })).status, 200);
    assert.equal(opened, 1);
    assert.equal((await fetch(base + "/messaging/events")).status, 401);
    const response = await fetch(base + "/messaging/events", { headers: { Cookie: headers.Cookie }, signal: AbortSignal.timeout(4000) });
    assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(response.headers.get("x-accel-buffering"), "no");
    const reader = response.body.getReader(); let text = "";
    while (!text.includes("event: typing:start")) { const chunk = await reader.read(); assert.equal(chunk.done, false); text += new TextDecoder().decode(chunk.value); }
    for (const name of ["sync", "message:new", "message:delivered", "message:read", "conversation:read", "presence:update", "typing:start"]) assert(text.includes(`event: ${name}\n`), name);
    revoked = true;
    while (true) { const chunk = await reader.read(); if (chunk.done) break; text += new TextDecoder().decode(chunk.value); }
    assert(text.includes("event: access:changed"));
    assert(!text.includes("senderStaffId"));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
