import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createAccountEmailRoutes } from "../src/modules/auth/account-email.routes.js";

test("account email HTTP requires a trusted Origin and session, rejects injected recipients and trust fields, and keeps codes private", async () => {
  const calls = [];
  const app = express(); app.use(express.json());
  const sessions = { async authenticate(token) {
    if (token !== "session") throw Object.assign(new Error("Please log in"), { status: 401 });
    return { account: { person: { id: "owner-from-session" } } };
  } };
  const verification = {
    async request(...args) { calls.push(args); return { email: "stored@example.com", retryAfterSeconds: 60 }; },
    async verify(...args) { calls.push(args); return { verified: true, emailVerifiedAt: "2026-10-17T17:00:00Z" }; },
  };
  app.use("/auth", createAccountEmailRoutes({ verification, sessions, clientUrl: "http://localhost:5173", nodeEnv: "test" }));
  app.use((error, req, res, next) => { void next; res.status(error.status ?? 500).json({ success: false, message: error.message }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  const post = (path, body, origin = "http://localhost:5173", cookie = "session") => fetch(`http://127.0.0.1:${server.address().port}/auth/email/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}), Cookie: `brightway_session=${cookie}` }, body: JSON.stringify(body),
  });
  try {
    for (const origin of [null, "https://foreign.example"]) assert.equal((await post("request", {}, origin)).status, 403);
    assert.equal((await post("request", {}, undefined, "invalid")).status, 401);
    for (const body of [{ email: "attacker@example.com" }, { personId: "someone-else" }, { verified: true }]) {
      assert.equal((await post("request", body)).status, 400);
    }
    const sent = await post("request", {}); assert.equal(sent.status, 200);
    assert.equal(sent.headers.get("cache-control"), "no-store");
    assert.deepEqual((await sent.json()).data, { email: "stored@example.com", retryAfterSeconds: 60 });
    assert.deepEqual(calls[0], ["owner-from-session", undefined]);
    for (const body of [{ code: "short" }, { code: "123456", email: "other@example.com" }, { code: "123456", emailVerifiedAt: "forged" }]) {
      assert.equal((await post("verify", body)).status, 400);
    }
    const verified = await post("verify", { code: "123456" });
    assert.equal(verified.status, 200); assert.equal((await verified.json()).data.verified, true);
    assert.deepEqual(calls[1], ["owner-from-session", "123456"]);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
