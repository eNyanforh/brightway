import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { identityFixture } from "../test-support/identity-fixture.js";
import { createPersonaClient, inquiryResult } from "../src/modules/identity/persona.client.js";
import { verifyPersonaSignature } from "../src/modules/identity/persona.webhook.js";

test("identity reads do not write; start binds an opaque inquiry to the owner and concurrent starts reuse one attempt", async () => {
  const f = identityFixture();
  assert.equal((await f.service.read("owner")).status, "not_started");
  assert.equal(f.state.identityVerification.length, 0);
  const [one, two] = await Promise.all([f.service.start("owner"), f.service.start("owner")]);
  assert.equal(one.inquiryId, two.inquiryId); assert.equal(f.state.identityInquiry.length, 1);
  assert.equal(one.identityVerified, false); assert.equal(one.environment, "sandbox");
  assert(!JSON.stringify(f.calls).includes("Private provider name"));
  assert.notEqual(f.calls[0].referenceId, "owner"); assert.notEqual(f.calls[0].referenceId, f.calls[0].idempotencyKey);
  assert.equal((await f.service.read("other")).inquiryId, null);
  await assert.rejects(f.service.start("other", one.attemptId), { status: 409 });
});
test("lost create responses retry with the original idempotency key and refuse retry after provider key retention", async () => {
  const f = identityFixture(); f.failProvider(); await assert.rejects(f.service.start("owner"), { status: 503 });
  assert.equal(f.state.identityInquiry.length, 1); f.failProvider(false);
  await f.service.start("owner"); assert.equal(f.calls[0].idempotencyKey, f.calls[1].idempotencyKey);
  assert.equal(f.inquiries.size, 1);
  const g = identityFixture(); g.failProvider(); await assert.rejects(g.service.start("owner"));
  g.advance(21 * 3600000); g.failProvider(false);
  await assert.rejects(g.service.start("owner"), { status: 409 }); assert.equal(g.calls.length, 1);
});
test("sandbox approval never grants real identity or credential trust and provider PII is not persisted", async () => {
  const f = identityFixture(); await f.service.start("owner"); f.advance(1000);
  await f.service.webhook(f.event(f.state.identityInquiry[0], "approved"));
  const result = await f.service.read("owner");
  assert.equal(result.sandboxApproved, true); assert.equal(result.identityVerified, false);
  assert.equal(f.state.account[0].identityVerified, undefined);
  assert(!JSON.stringify(f.state).includes("Private provider name"));
  assert.equal(f.state.identityWebhookReceipt.length, 1);
});
test("completed and review-needed inquiries are not approved; newer declines supersede approvals and delayed events cannot restore them", async () => {
  const f = identityFixture(); await f.service.start("owner"); const a = f.state.identityInquiry[0];
  for (const status of ["completed", "needs_review", "approved", "declined"]) {
    f.advance(1000); await f.service.webhook(f.event(a, status));
    assert.equal((await f.service.read("owner")).sandboxApproved, status === "approved");
  }
  await f.service.webhook(f.event(a, "approved", "evt_delayed", new Date(+f.now() - 1000)));
  assert.equal((await f.service.read("owner")).status, "declined");
});
test("identity detail and photo changes invalidate approvals and old-attempt callbacks cannot approve a replacement", async () => {
  const f = identityFixture(); await f.service.start("owner"); const old = structuredClone(f.state.identityInquiry[0]);
  f.advance(1000); await f.service.webhook(f.event(old, "approved"));
  f.state.account[0].person.profile.photoId = "replacement";
  assert.equal((await f.service.read("owner")).status, "stale");
  await assert.rejects(f.service.refresh("owner"), { status: 409 });
  const replacement = await f.service.start("owner"); assert.notEqual(old.inquiryId, replacement.inquiryId);
  f.advance(1000); await f.service.webhook(f.event(old, "approved"));
  assert.equal((await f.service.read("owner")).sandboxApproved, false);
  f.state.account[0].person.firstName = "Changed";
  assert.equal((await f.service.read("owner")).status, "stale");
});
test("duplicate webhooks have one receipt; receipt failure rolls back status; changed binding and foreign templates fail closed", async () => {
  const f = identityFixture(); await f.service.start("owner"); f.advance(1000);
  const e = f.event(f.state.identityInquiry[0], "approved");
  await Promise.all([f.service.webhook(e), f.service.webhook(e)]);
  assert.equal(f.state.identityWebhookReceipt.length, 1);
  const bad = structuredClone(e); bad.data.id = "evt_bad";
  bad.data.attributes.payload.data.attributes["reference-id"] = "foreign";
  await assert.rejects(f.service.webhook(bad), { status: 503 });
  const wrong = structuredClone(e); wrong.data.id = "evt_wrong";
  wrong.data.attributes.payload.data.relationships["inquiry-template"].data.id = "itmpl_foreign";
  await assert.rejects(f.service.webhook(wrong), { status: 503 });
  const g = identityFixture(); await g.service.start("owner"); g.advance(1000); g.failReceipt();
  await assert.rejects(g.service.webhook(g.event(g.state.identityInquiry[0], "approved")));
  assert.equal((await g.service.read("owner")).status, "created"); assert.equal(g.state.identityWebhookReceipt.length, 0);
});
test("server refresh uses the bound inquiry, daily inquiry budgets persist, and suspended/unverified accounts cannot start", async () => {
  const f = identityFixture(); await f.service.start("owner"); f.advance(1000);
  const a = f.state.identityInquiry[0]; f.inquiries.set(a.idempotencyKey, { inquiryId: a.inquiryId, status: "approved", updatedAt: f.now() });
  assert.equal((await f.service.refresh("owner")).sandboxApproved, true);
  const g = identityFixture();
  for (let i = 0; i < 5; i++) { g.state.account[0].person.firstName = `Revision ${i}`; await g.service.start("owner"); }
  g.state.account[0].person.firstName = "Too many"; await assert.rejects(g.service.start("owner"), { status: 429 });
  g.advance(86400000); await g.service.start("owner");
  const h = identityFixture(); h.state.account[0].emailVerifiedAt = null; await assert.rejects(h.service.start("owner"), { status: 403 });
  h.state.account[0].status = "SUSPENDED"; await assert.rejects(h.service.start("owner"), { status: 401 });
});
test("Persona transport is sandbox-only, pins its API version, uses fixed endpoints and sanitizes provider failures", async () => {
  const options = { apiKey: "persona_sandbox_testkey", templateId: "itmpl_test", nodeEnv: "test" };
  for (const bad of [{ environment: "production" }, { nodeEnv: "production" }, { apiKey: "persona_production_key" }, { apiKey: "" }, { templateId: "" }]) {
    assert.throws(() => createPersonaClient({ ...options, ...bad }).check(), { status: 503 });
  }
  let sent;
  const p = createPersonaClient({ ...options, fetcher: async (url, request) => { sent = { url, request }; return { ok: true, json: async () => ({ data: {
    id: "inq_test", type: "inquiry", attributes: { status: "created", "reference-id": "reference", "updated-at": "2026-10-22T18:00:00Z" },
    relationships: { "inquiry-template": { data: { id: "itmpl_test" } } },
  } }) }; } });
  await p.create({ templateId: "itmpl_test", referenceId: "reference", idempotencyKey: "random-key" });
  assert.equal(sent.url, "https://api.withpersona.com/api/v1/inquiries");
  assert.equal(sent.request.headers["Persona-Version"], "2026-09-29");
  assert.equal(sent.request.headers["Idempotency-Key"], "random-key");
  assert.equal(sent.request.redirect, "error");
  const broken = createPersonaClient({ ...options, fetcher: async () => { throw Error("secret-provider-response"); } });
  await assert.rejects(broken.create({}), (e) => e.status === 503 && !e.message.includes("secret-provider-response"));
  assert.throws(() => inquiryResult({ id: "inq_foreign" }, {}), { status: 503 });
});
test("webhook signatures authenticate raw bytes, reject stale/future/forged bodies and support rotating secrets", () => {
  const date = new Date("2026-10-22T18:00:00Z"), raw = Buffer.from('{"data": {"id": "evt_test"}}'), secret = "test-only-webhook-secret";
  const sign = (t, key = secret) => `t=${t},v1=${createHmac("sha256", key).update(`${t}.`).update(raw).digest("hex")}`;
  const t = Math.floor(+date / 1000), valid = sign(t);
  verifyPersonaSignature(raw, valid, secret, date);
  verifyPersonaSignature(raw, `${sign(t, "old")} ${valid}`, secret, date);
  for (const header of [sign(t - 301), sign(t + 301), "malformed", sign(t, "wrong")]) assert.throws(() => verifyPersonaSignature(raw, header, secret, date), { status: 401 });
  assert.throws(() => verifyPersonaSignature(Buffer.from('{}'), valid, secret, date), { status: 401 });
  assert.throws(() => verifyPersonaSignature(raw, valid, "", date), { status: 503 });
});
