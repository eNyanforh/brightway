import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { credentialFixture } from "../test-support/credential-fixture.js";
import { createCredentialService } from "../src/modules/credentials/credential.service.js";
import { createCredentialRoutes } from "../src/modules/credentials/credential.routes.js";
import { assertMfaSession } from "../src/modules/auth/mfa.service.js";

async function fixture() {
  const f = credentialFixture();
  let downloads = 0;
  f.storage.get = async () => { downloads++; return Buffer.from("private evidence"); };
  const service = createCredentialService({ prisma: f.db, storage: f.storage, now: f.now,
    process: async (bytes, contentType) => ({ bytes, contentType }) });
  const asset = await service.upload(f.personId, "education", f.recordId, 1, Buffer.from("evidence"), "application/pdf");
  await service.submit(f.personId, f.ownerId, "education", f.recordId, { expectedVersion: 1, revision: 1, evidenceIds: [asset.id] });
  return { ...f, service, asset, downloads: () => downloads };
}

test("MFA assertion rejects omitted identities before an undefined filter can match another session", async () => {
  const db = new Proxy({}, { get() { throw new Error("Missing identifiers must fail before querying"); } });
  for (const [accountId, sessionId] of [[undefined, "session"], ["reviewer", undefined], ["reviewer", null], ["reviewer", ""], ["reviewer", " "], ["reviewer", {}]]) {
    await assert.rejects(assertMfaSession(db, accountId, sessionId), { status: 403 });
  }
});

test("every reviewer service entry point rejects missing MFA context despite another valid session", async () => {
  const f = await fixture(), review = f.state.credentialReview[0];
  const before = structuredClone(f.state);
  for (const sessionId of [undefined, null, "", randomUUID()]) {
    await assert.rejects(f.service.access(f.reviewerId, sessionId), { status: 403 });
    await assert.rejects(f.service.queue(f.reviewerId, undefined, sessionId), { status: 403 });
    await assert.rejects(f.service.detail(f.reviewerId, review.id, sessionId), { status: 403 });
    await assert.rejects(f.service.transition(f.reviewerId, review.id, { expectedVersion: review.version }, true, sessionId), { status: 403 });
    await assert.rejects(f.service.readEvidence(f.reviewerId, "reviewer-person", f.asset.id, sessionId), { status: 403 });
  }
  assert.deepEqual(f.state, before);
  assert.equal(f.downloads(), 0);
});

test("privileged reads and decisions reject expired, foreign, password-only, disabled and stale-version sessions", async () => {
  const mutations = [
    f => { f.state.session[0].expiresAt = f.now(); },
    f => { f.state.session[0].accountId = f.otherId; },
    f => { f.state.session[0].mfaVerifiedAt = null; },
    f => { f.state.mfaFactor[0].enabled = false; },
    f => { f.state.mfaFactor[0].version++; },
    f => { f.state.session.length = 0; },
    f => { f.state.account[1].platformRole = "MEMBER"; },
  ];
  for (const mutate of mutations) {
    const f = await fixture(), review = f.state.credentialReview[0];
    await f.service.transition(f.reviewerId, review.id, { expectedVersion: review.version }, true, f.reviewerSessionId);
    mutate(f);
    const before = structuredClone(f.state);
    await assert.rejects(f.service.access(f.reviewerId, f.reviewerSessionId), { status: 403 });
    await assert.rejects(f.service.queue(f.reviewerId, undefined, f.reviewerSessionId), { status: 403 });
    await assert.rejects(f.service.detail(f.reviewerId, review.id, f.reviewerSessionId), { status: 403 });
    await assert.rejects(f.service.transition(f.reviewerId, review.id, { expectedVersion: review.version, revision: 1, status: "VERIFIED", note: "The institution confirmed this claim." }, false, f.reviewerSessionId), { status: 403 });
    await assert.rejects(f.service.readEvidence(f.reviewerId, "reviewer-person", f.asset.id, f.reviewerSessionId), error => [403, 404].includes(error.status));
    assert.deepEqual(f.state, before);
    assert.equal(f.downloads(), 0);
  }
});

test("valid MFA does not grant a reviewer role or permit self-review; owners retain their own evidence", async () => {
  const f = await fixture(), review = f.state.credentialReview[0];
  const memberSession = f.authorizeReviewer(f.otherId);
  await assert.rejects(f.service.access(f.otherId, memberSession), { status: 403 });
  f.state.account[0].platformRole = "CREDENTIAL_REVIEWER";
  const ownerSession = f.authorizeReviewer(f.ownerId);
  await assert.rejects(f.service.detail(f.ownerId, review.id, ownerSession), { status: 403 });
  await assert.rejects(f.service.transition(f.ownerId, review.id, { expectedVersion: review.version }, true, ownerSession), { status: 403 });
  assert.equal((await f.service.readEvidence(f.ownerId, f.personId, f.asset.id)).bytes.toString(), "private evidence");
  assert.equal(f.state.credentialReview[0].status, "SUBMITTED");
});

test("HTTP reviewer paths carry the authenticated session and reject revoked access, injected privilege and foreign Origin", async () => {
  const f = await fixture(), app = express();
  app.use(express.json());
  const sessions = { async authenticate(token) {
    if (!["reviewer", "password-only", "member"].includes(token)) throw Object.assign(new Error("Login required"), { status: 401 });
    const account = f.state.account.find(row => row.id === (token === "member" ? f.otherId : f.reviewerId));
    return { account: { id: account.id, person: { id: account.personId } }, sessionId: f.reviewerSessionId, mfaVerified: token !== "password-only" };
  } };
  app.use(createCredentialRoutes({ credentials: f.service, sessions, clientUrl: "http://localhost:5173", nodeEnv: "test", limiter: (req, res, next) => next() }));
  app.use((error, req, res, next) => { void next; res.status(error.status ?? 500).json({ success: false, message: error.message }); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const review = f.state.credentialReview[0];
  const headers = { Cookie: "brightway_session=reviewer", Origin: "http://localhost:5173", "Content-Type": "application/json" };
  try {
    for (const route of ["/admin/credentials/access", "/admin/credentials", `/admin/credentials/${review.id}`]) {
      assert.equal((await fetch(base + route)).status, 401);
      assert.equal((await fetch(base + route, { headers: { Cookie: "brightway_session=password-only" } })).status, 403);
      assert.equal((await fetch(base + route, { headers: { Cookie: "brightway_session=member" } })).status, 403);
      const allowed = await fetch(base + route, { headers });
      assert.equal(allowed.status, 200);
      assert.equal(allowed.headers.get("cache-control"), "no-store");
    }
    const assign = `/admin/credentials/${review.id}/assign`;
    assert.equal((await fetch(base + assign, { method: "POST", headers: { ...headers, Origin: "https://foreign.example" }, body: JSON.stringify({ expectedVersion: review.version }) })).status, 403);
    assert.equal((await fetch(base + assign, { method: "POST", headers, body: JSON.stringify({ expectedVersion: review.version, mfaVerified: true }) })).status, 400);
    assert.equal((await fetch(base + assign, { method: "POST", headers, body: JSON.stringify({ expectedVersion: review.version }) })).status, 200);
    assert.equal((await fetch(base + `/credentials/evidence/${f.asset.id}/download`, { headers })).status, 200);
    f.state.session.length = 0;
    assert.equal((await fetch(base + "/admin/credentials", { headers })).status, 403);
    assert.equal((await fetch(base + `/credentials/evidence/${f.asset.id}/download`, { headers })).status, 403);
    const current = f.state.credentialReview[0];
    assert.equal((await fetch(base + `/admin/credentials/${review.id}/decision`, { method: "POST", headers,
      body: JSON.stringify({ expectedVersion: current.version, revision: 1, status: "VERIFIED", note: "The institution confirmed this claim." }) })).status, 403);
    assert.equal(f.state.educationRecord[0].status, "IN_REVIEW");
    assert.equal(f.state.credentialAuditEvent.some(row => row.action === "DECIDED"), false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
