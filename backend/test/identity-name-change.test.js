import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { manualReviewFixture } from "../test-support/manual-identity-review-fixture.js";
import { createIdentityNameChangeService, NAME_CHANGE_CONSENT } from "../src/modules/manual-identity/identity-name-change.service.js";
import { createIdentityNameChangeRoutes } from "../src/modules/manual-identity/identity-name-change.routes.js";

async function fixture() {
  const f = manualReviewFixture(); await f.service.submit(f.ownerId, f.submission()); await f.assign(); await f.decide();
  const ownerSessionId = randomUUID(); f.state.account[0].passwordHash = "owner-hash";
  f.state.session.push({ id: ownerSessionId, accountId: f.ownerId, expiresAt: new Date(+f.now() + 100 * 86400000) });
  const service = createIdentityNameChangeService({ prisma: f.db, storage: f.storage, photoStorage: f.storage, now: f.now, policy: f.policy, verify: async password => password === "correct password" });
  const input = () => {
    const [governmentId, selfie] = f.images();
    return { expectedProfileVersion: f.state.profile[0].version, expectedIdentityRevision: f.state.account[0].person.identityRevision,
      idempotencyKey: randomUUID(), password: "correct password", proposedName: { firstName: "Corrected", middleName: "New", lastName: "Owner" },
      reason: "My saved name has a spelling error.", governmentId, selfie, consentVersion: NAME_CHANGE_CONSENT };
  };
  const submit = body => service.submit(f.ownerId, ownerSessionId, body ?? input());
  const assign = row => service.assign(f.reviewerId, f.sessionId, row.id, { expectedVersion: row.version });
  const decide = (row, decision = "APPROVED") => service.decide(f.reviewerId, f.sessionId, row.id, { expectedVersion: row.version, expectedProfileVersion: f.state.profile[0].version, decision, note: "Compared the fresh government ID and selfie against the proposed name." });
  return { ...f, changes: service, input, submitName: submit, assignName: assign, decideName: decide, ownerSessionId };
}

test("name requests preserve the saved name and badge, atomically bind fresh evidence and replay without storing passwords", async () => {
  const f = await fixture(), input = f.input(), before = structuredClone(f.state.account[0].person);
  const [a, b] = await Promise.all([f.submitName(input), f.submitName(input)]);
  assert.equal(a.id, b.id); assert.equal(f.state.identityNameChange.length, 1);
  assert.deepEqual(f.state.account[0].person, before); assert.equal((await f.service.status(f.ownerId)).identityVerified, true);
  assert.equal(f.state.manualIdentityEvidence.filter(e => e.nameChangeId === a.id && e.state === "ATTACHED").length, 2);
  assert(!JSON.stringify(f.state.identityNameChange).includes("correct password"));
  await assert.rejects(f.submitName({ ...input, proposedName: { ...input.proposedName, lastName: "Changed" } }), { status: 409 });
});

test("only currently verified owners with valid password/session can submit strict name requests", async () => {
  const f = await fixture(), body = f.input();
  await assert.rejects(f.submitName({ ...body, identityVerified: true }), { status: 400 });
  await assert.rejects(f.submitName({ ...body, proposedName: { ...body.proposedName, birthDate: "2000-01-01" } }), { status: 400 });
  await assert.rejects(f.submitName({ ...body, proposedName: { firstName: "Sample", middleName: null, lastName: "Owner" } }), { status: 400 });
  await assert.rejects(f.submitName({ ...body, password: "wrong password" }), { status: 400 });
  await assert.rejects(f.changes.submit(f.ownerId, f.sessionId, body), { status: 401 });
  f.state.profile[0].educationRecords[0].revision++;
  await assert.rejects(f.submitName(body), { status: 403 });
  assert.equal(f.state.identityNameChange.length, 0);
});

test("wrong password budgets persist across concurrent guesses, while missing MFA or changed passwords cannot write", async () => {
  const f = await fixture(), body = { ...f.input(), password: "wrong" };
  const results = await Promise.allSettled(Array.from({ length: 7 }, () => f.submitName(body)));
  assert.equal(results.filter(r => r.reason?.status === 400).length, 5); assert.equal(results.filter(r => r.reason?.status === 429).length, 2);
  assert.equal(f.state.identityNameChange.length, 0);
  const g = await fixture(); g.state.mfaFactor.push({ accountId: g.ownerId, enabled: true, version: 1 });
  await assert.rejects(g.submitName(), { status: 403 });
  const h = await fixture();
  const raced = createIdentityNameChangeService({ prisma: h.db, storage: h.storage, now: h.now, policy: h.policy, verify: async () => { h.state.account[0].passwordHash = "changed"; return true; } });
  await assert.rejects(raced.submit(h.ownerId, h.ownerSessionId, h.input()), { status: 401 });
});

test("foreign, attached, wrong-kind, expired evidence and stale revisions cannot leave partial claims", async () => {
  for (const kind of ["foreign", "attached", "wrong-kind", "expired", "revision", "profile"]) {
    const f = await fixture(), data = f.input(), asset = f.state.manualIdentityEvidence.find(e => e.id === data.selfie);
    if (kind === "foreign") asset.accountId = f.otherId;
    if (kind === "attached") { asset.state = "ATTACHED"; asset.attemptId = f.state.manualIdentityAttempt[0].id; }
    if (kind === "wrong-kind") asset.kind = "GOVERNMENT_ID";
    if (kind === "expired") asset.expiresAt = f.now();
    if (kind === "revision") data.expectedIdentityRevision++;
    if (kind === "profile") data.expectedProfileVersion++;
    await assert.rejects(f.submitName(data), { status: ["revision", "profile"].includes(kind) ? 409 : 400 });
    assert.equal(f.state.identityNameChange.length, 0);
    assert.equal(f.state.manualIdentityEvidence.find(e => e.id === data.governmentId).state, "READY");
  }
});

test("only assigned identity reviewers with live MFA can see private requests or approve, and self-review is denied", async () => {
  const f = await fixture(), result = await f.submitName(), row = f.state.identityNameChange[0];
  const before = await f.changes.detail(f.reviewerId, f.sessionId, result.id);
  assert.equal(before.proposedName, null); assert.deepEqual(before.evidence, []);
  await assert.rejects(f.decideName(row), { status: 403 });
  await assert.rejects(f.changes.detail(f.ownerId, f.ownerSessionId, result.id), { status: 403 });
  f.state.manualIdentityReviewer.push({ accountId: f.ownerId, enabled: true });
  f.state.mfaFactor.push({ accountId: f.ownerId, enabled: true, version: 1 });
  Object.assign(f.state.session.find(s => s.id === f.ownerSessionId), { mfaVersion: 1, mfaVerifiedAt: f.now() });
  await assert.rejects(f.changes.detail(f.ownerId, f.ownerSessionId, result.id), e => e.status === 403 && e.message.includes("own name correction"));
  await f.assignName(row);
  assert.deepEqual(await f.changes.portrait(f.reviewerId, f.sessionId, result.id), Buffer.from("private WebP bytes"));
  const detail = await f.changes.detail(f.reviewerId, f.sessionId, result.id);
  assert.equal(detail.proposedName.firstName, "Corrected"); assert.equal(detail.evidence.length, 2);
  f.state.manualIdentityReviewer[0].enabled = false;
  await assert.rejects(f.decideName(f.state.identityNameChange[0]), { status: 403 });
  assert.equal(f.state.account[0].person.firstName, "Sample");
});

test("approval changes only the requested name and binds exact trust without rewriting original identity snapshots", async () => {
  const f = await fixture(), original = structuredClone(f.state.manualIdentityAttempt[0]), body = f.input();
  await f.submitName(body); await f.assignName(f.state.identityNameChange[0]); await f.decideName(f.state.identityNameChange[0]);
  assert.equal(f.state.account[0].person.firstName, "Corrected"); assert.equal(f.state.account[0].person.middleName, "New");
  assert.equal(f.state.account[0].person.identityRevision, 1); assert.equal(f.state.profile[0].version, 2);
  assert.equal((await f.service.status(f.ownerId)).identityVerified, true);
  assert.deepEqual(f.state.manualIdentityAttempt[0].snapshot, original.snapshot); assert.equal(f.state.manualIdentityAttempt[0].identityHash, original.identityHash);
  assert.equal(f.state.identityNameChangeAudit.filter(e => e.action === "DECIDED").length, 1);
  await assert.rejects(f.decideName(f.state.identityNameChange[0]), { status: 409 });
  f.state.account[0].person.identityRevision += 2;
  assert.equal((await f.service.status(f.ownerId)).identityVerified, false);
});

test("decline and owner cancellation preserve names/trust, while foreign cancellation and conflicting active submissions fail", async () => {
  const f = await fixture(); await f.submitName(); const row = f.state.identityNameChange[0];
  await assert.rejects(f.submitName(), { status: 409 });
  await assert.rejects(f.changes.cancel(f.otherId, f.ownerSessionId, row.id, { expectedVersion: row.version }), { status: 401 });
  await f.assignName(row); await f.decideName(f.state.identityNameChange[0], "DECLINED");
  assert.equal(f.state.account[0].person.firstName, "Sample"); assert.equal((await f.service.status(f.ownerId)).identityVerified, true);
  await f.submitName(); const next = f.state.identityNameChange[1];
  await f.changes.cancel(f.ownerId, f.ownerSessionId, next.id, { expectedVersion: next.version });
  assert.equal(f.state.identityNameChange[1].state, "CANCELLED"); assert.equal(f.state.account[0].person.firstName, "Sample");
});

test("audit failure and stale eligibility roll back name, version, attestation and latest-proof pointer", async () => {
  const f = await fixture(); await f.submitName(); await f.assignName(f.state.identityNameChange[0]); f.failAudit();
  await assert.rejects(f.decideName(f.state.identityNameChange[0]));
  assert.equal(f.state.account[0].person.firstName, "Sample"); assert.equal(f.state.profile[0].version, 1);
  assert.equal(f.state.identityNameChange[0].state, "IN_REVIEW"); assert.equal(f.state.identityNameChange[0].approvedIdentityHash, null);
  assert(!f.state.account[0].latestNameChangeId);
  f.failAudit(false); f.state.profile[0].experienceRecords[0].revision++;
  await assert.rejects(f.decideName(f.state.identityNameChange[0]), { status: 409 });
});

test("retention purges name/evidence payloads while exact approved trust and minimal decision audit remain", async () => {
  const f = await fixture(); await f.submitName(); await f.assignName(f.state.identityNameChange[0]); await f.decideName(f.state.identityNameChange[0]);
  f.advance(31 * 86400000);
  assert.deepEqual(await f.changes.cleanup(), { purged: 1 });
  const row = f.state.identityNameChange[0]; assert.equal(row.previousName, null); assert.equal(row.proposedName, null); assert.equal(row.reason, null); assert.equal(row.note, null);
  assert.equal((await f.service.status(f.ownerId)).identityVerified, true);
  assert(f.state.manualIdentityEvidence.filter(e => e.nameChangeId === row.id).every(e => e.state === "DELETE_PENDING"));
  assert.equal(f.state.identityNameChangeAudit.filter(e => e.action === "DECIDED").length, 1);
  assert.deepEqual(await f.changes.cleanup(), { purged: 0 });
});

test("a slow private evidence read rechecks permission before returning bytes", async () => {
  const f = await fixture(); await f.submitName(); await f.assignName(f.state.identityNameChange[0]);
  const row = f.state.identityNameChange[0], image = f.state.manualIdentityEvidence.find(e => e.nameChangeId === row.id);
  f.storage.get = async () => { f.state.manualIdentityReviewer[0].enabled = false; return Buffer.from("private"); };
  await assert.rejects(f.changes.portrait(f.reviewerId, f.sessionId, row.id), { status: 403 });
  f.state.manualIdentityReviewer[0].enabled = true;
  await assert.rejects(f.changes.image(f.reviewerId, f.sessionId, row.id, image.id), { status: 403 });
});

test("expired requests release the active slot through an audited transition instead of blocking a fresh request", async () => {
  const f = await fixture(); await f.submitName(); const old = f.state.identityNameChange[0];
  f.advance(31 * 86400000); assert.equal((await f.changes.owner(f.ownerId)).canRequest, true);
  const next = await f.submitName(); assert.notEqual(next.id, old.id);
  assert.equal(f.state.identityNameChange[0].state, "EXPIRED");
  assert.equal(f.state.identityNameChange.filter(r => r.state === "SUBMITTED").length, 1);
  assert.equal(f.state.identityNameChangeAudit.filter(e => e.action === "EXPIRED").length, 1);
});

test("a name proof cannot grant another account's trust or survive a bound credential revision change", async () => {
  const f = await fixture(); await f.submitName(); await f.assignName(f.state.identityNameChange[0]); await f.decideName(f.state.identityNameChange[0]);
  f.state.identityNameChange[0].accountId = f.otherId;
  assert.equal((await f.service.status(f.ownerId)).identityVerified, false);
  f.state.identityNameChange[0].accountId = f.ownerId; f.state.profile[0].educationRecords[0].revision++;
  assert.equal((await f.service.status(f.ownerId)).identityVerified, false);
});

test("name-correction HTTP routes require sessions, trusted Origin, MFA and private uncached responses", async () => {
  const f = await fixture(), app = express(); app.use(express.json());
  app.use("/api/v1", createIdentityNameChangeRoutes({ changes: f.changes, sessions: { async authenticate(token) {
    if (!["owner", "reviewer", "password-only"].includes(token)) throw Object.assign(Error("Login required"), { status: 401 });
    return { account: { id: token === "owner" ? f.ownerId : f.reviewerId }, sessionId: token === "owner" ? f.ownerSessionId : f.sessionId, mfaVerified: token === "reviewer" };
  } }, clientUrl: "http://localhost:5173", nodeEnv: "test", limiter: (req, res, next) => next() }));
  app.use((e, req, res, next) => { void next; res.status(e.status ?? 500).json({ success: false, message: e.message }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`, headers = { Cookie: "brightway_session=owner", Origin: "http://localhost:5173", "Content-Type": "application/json" };
  try {
    assert.equal((await fetch(base + "/manual-identity/name-changes")).status, 401);
    assert.equal((await fetch(base + "/admin/name-changes", { headers: { Cookie: "brightway_session=password-only" } })).status, 403);
    const denied = await fetch(base + "/manual-identity/name-changes", { method: "POST", headers: { ...headers, Origin: "https://foreign.invalid" }, body: JSON.stringify(f.input()) }); assert.equal(denied.status, 403);
    const response = await fetch(base + "/manual-identity/name-changes", { headers }); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    assert(!(await response.text()).includes("passwordHash"));
    assert.equal((await fetch(base + "/manual-identity/name-changes", { method: "POST", headers, body: JSON.stringify(f.input()) })).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
