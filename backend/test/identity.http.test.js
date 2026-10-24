import { createIdentityQueue } from "../src/modules/identity/identity.queue.js";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createHmac } from "node:crypto";
import { identityFixture } from "../test-support/identity-fixture.js";
import { createIdentityRoutes } from "../src/modules/identity/identity.routes.js";

test("identity HTTP authenticates the actual session account, requires Origin, rejects trust injection and verifies raw webhook bytes", async () => {
  const f = identityFixture(), secret = "test-only-webhook-secret", app = express();
  app.use(express.json({ verify(req, res, buf) { req.rawBody = Buffer.from(buf); } }));
  app.use("/api/v1", createIdentityRoutes({ identity: f.service, sessions: { async authenticate(token) {
    if (token !== "owner-session") throw Object.assign(Error("Please log in"), { status: 401 });
    return { account: { id: "owner" }, sessionId: "session" };
  } }, clientUrl: "http://localhost:5173", nodeEnv: "test", webhookSecret: secret, now: f.now, limiter: (req, res, next) => next() }));
  app.use((err, req, res, next) => { void next; res.status(err.status ?? 500).json({ success: false, message: err.message }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/identity`;
  const headers = { "Content-Type": "application/json", Origin: "http://localhost:5173", Cookie: "brightway_session=owner-session" };
  try {
    assert.equal((await fetch(base)).status, 401);
    const read = await fetch(base, { headers }); assert.equal(read.status, 200); assert.equal(read.headers.get("cache-control"), "no-store");
    for (const Origin of [undefined, "https://foreign.example"]) {
      const h = { ...headers }; if (Origin) h.Origin = Origin; else delete h.Origin;
      assert.equal((await fetch(`${base}/start`, { method: "POST", headers: h, body: "{}" })).status, 403);
    }
    for (const body of [{ accountId: "other" }, { inquiryId: "inq_foreign" }, { status: "approved" }, { identityVerified: true }]) {
      assert.equal((await fetch(`${base}/start`, { method: "POST", headers, body: JSON.stringify(body) })).status, 400);
    }
    const start = await fetch(`${base}/start`, { method: "POST", headers, body: "{}" });
    assert.equal(start.status, 200); assert.equal((await start.json()).data.identityVerified, false);
    assert.equal(f.state.identityInquiry[0].accountId, "owner");
    f.advance(1000); const raw = JSON.stringify(f.event(f.state.identityInquiry[0], "approved"));
    const t = Math.floor(+f.now() / 1000), signature = `t=${t},v1=${createHmac("sha256", secret).update(`${t}.`).update(raw).digest("hex")}`;
    assert.equal((await fetch(`${base}/persona/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: raw })).status, 401);
    const webhookHeaders = { "Content-Type": "application/json", "Persona-Signature": signature };
    const posted = await fetch(`${base}/persona/webhook`, { method: "POST", headers: webhookHeaders, body: raw });
    assert.equal(posted.status, 202); assert.equal(posted.headers.get("cache-control"), "no-store");
    assert.equal((await f.service.read("owner")).sandboxApproved, false);
    assert.equal(f.state.identityWebhookJob.length, 1);
    const queue = createIdentityQueue({ prisma: f.db, identity: f.service, now: f.now });
    await queue.processBatch();
    assert.equal((await f.service.read("owner")).sandboxApproved, true);
    assert.equal((await fetch(`${base}/persona/webhook`, { method: "POST", headers: webhookHeaders, body: raw })).status, 202);
    assert.equal(f.state.identityWebhookReceipt.length, 1);
    const after = await fetch(base, { headers }); const serialized = JSON.stringify(await after.json());
    for (const value of [secret, "referenceId", "identityHash", "Private provider name", "idempotencyKey"]) assert(!serialized.includes(value));
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
