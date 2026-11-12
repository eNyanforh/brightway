import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { createBillingRoutes } from "../src/modules/billing/billing.routes.js";
import { createSessionCookieConfig } from "../src/modules/auth/session.http.js";
import * as s from "../src/modules/billing/billing.schema.js";

test("billing windows enforce 30 days and require a full recorded student notice", () => {
  const dueAt = s.dueFor({ resumesOn: new Date("2030-01-01") }); assert.equal(dueAt.toISOString(), "2030-01-31T00:00:00.000Z");
  const c = { id: randomUUID(), engine: "GRADE_SCHOOL", amountCents: 100, adjustments: [], allocations: [], dueAt, noticeAt: null, enforceAt: null };
  assert.equal(s.accessState(c, new Date("2031-01-01")).restricted, false);
  c.noticeAt = new Date("2030-02-02"); c.enforceAt = new Date("2030-02-09");
  assert.equal(s.accessState(c, new Date("2030-02-08T23:59:59Z")).restricted, false);
  assert.equal(s.accessState(c, c.enforceAt).restricted, true);
  c.allocations = [{ amountCents: 100, payment: { status: "PENDING" } }]; assert.equal(s.outstanding(c), 100);
  c.allocations[0].payment.status = "CONFIRMED"; assert.equal(s.accessState(c, c.enforceAt).restricted, false);
  c.allocations = []; c.engine = "TVET"; assert.equal(s.accessState(c, c.enforceAt).restricted, false);
});
test("payment and adjustment schemas reject duplicated, fractional, foreign or ambiguous amounts", () => {
  const chargeId = randomUUID(), input = { requestKey: randomUUID(), reference: "School receipt", allocations: [{ chargeId, amountCents: 100 }] };
  assert.equal(s.parse(s.paymentInput, input).allocations.length, 1);
  for (const body of [{ ...input, currency: "LRD" }, { ...input, allocations: [...input.allocations, ...input.allocations] }, { ...input, allocations: [{ chargeId, amountCents: .1 }] }, { ...input, allocations: [] }, { ...input, allocations: [{ chargeId, amountCents: 101 }] }]) assert.throws(() => s.parse(s.paymentInput, body), { status: 400 });
  assert.throws(() => s.parse(s.decisionInput, { decision: "CONFIRM", reason: "Verified actual receipt." }), { status: 400 });
  assert.throws(() => s.parse(s.decisionInput, { decision: "REJECT", reason: "Receipt not received.", settlementReference: "r" }), { status: 400 });
  assert.throws(() => s.parse(s.adjustmentInput, { requestKey: randomUUID(), amountCents: 0, reason: "No financial effect." }), { status: 400 });
});
test("billing HTTP requires the correct identity realm, trusted origins and private responses", async t => {
  const calls = [], actorId = randomUUID();
  const billing = { statement: async (...args) => { calls.push(args); return { balanceCents: 100 }; }, submitPayment: async (...args) => { calls.push(args); return { status: "PENDING" }; }, queue: async () => ({ items: [] }) };
  const sessions = { read: async token => token === "valid" ? { account: { id: actorId, status: "ACTIVE" }, sessionId: "session" } : Promise.reject(Object.assign(Error("Sign in"), { status: 401 })) };
  // Match actual session service method; no network or application database involved.
  sessions.authenticate = sessions.read;
  const app = express(); app.use(express.json()); app.use(createBillingRoutes({ billing, sessions, authentication: { authenticate: async () => null }, clientUrl: "http://localhost:5173", nodeEnv: "test" })); app.use((e, _r, res, _n) => res.status(e.status || 500).json({ message: e.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise(r => server.once("listening", r)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`, path = `/organization-workspace/${randomUUID()}/campus/billing`, cookie = `${createSessionCookieConfig("test").name}=valid`;
  assert.equal((await fetch(base + path)).status, 401);
  assert.equal((await fetch(base + path + "/payments", { method: "POST", headers: { Cookie: cookie, Origin: "https://untrusted.invalid", "Content-Type": "application/json" }, body: "{}" })).status, 403);
  const read = await fetch(base + path, { headers: { Cookie: cookie } }); assert.equal(read.status, 200); assert.equal(read.headers.get("cache-control"), "no-store");
  assert.equal(calls[0][0].accountId, actorId);
  assert.equal((await fetch(base + "/management/billing", { headers: { Cookie: cookie } })).status, 401);
});
