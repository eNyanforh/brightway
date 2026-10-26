import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { manualReviewFixture } from "../test-support/manual-identity-review-fixture.js";
import { createManualIdentityReviewService } from "../src/modules/manual-identity/manual-identity-review.service.js";
import { createManualIdentityReviewRoutes } from "../src/modules/manual-identity/manual-identity-review.routes.js";
import { fiveWorkingDaysAfter, reviewPolicy } from "../src/modules/manual-identity/manual-identity.policy.js";
const DAY = 86400000;

test("five-working-day targets skip weekends and configured holidays; retention requires an explicit setting", () => {
  assert.equal(fiveWorkingDaysAfter("2026-10-23T12:00:00Z").toISOString(), "2026-10-30T12:00:00.000Z");
  assert.equal(fiveWorkingDaysAfter("2026-10-25T12:00:00Z").toISOString(), "2026-10-30T12:00:00.000Z");
  assert.equal(fiveWorkingDaysAfter("2026-10-23T12:00:00Z", ["2026-10-26"]).toISOString(), "2026-11-02T12:00:00.000Z");
  assert.throws(() => reviewPolicy({}).check(), { status: 503 });
  assert.throws(() => reviewPolicy({ MANUAL_IDENTITY_RETENTION_DAYS: "30", MANUAL_IDENTITY_HOLIDAYS: "2026-02-31" }).check(), { status: 503 });
});

test("submission is strict, owner-bound and requires complete profile plus both verified histories", async () => {
  const f = manualReviewFixture(), data = f.submission();
  for (const field of ["accountId", "identityVerified", "reviewerId", "status"]) await assert.rejects(f.service.submit(f.ownerId, { ...data, [field]: true }), { status: 400 });
  await assert.rejects(f.service.submit(undefined, data), { status: 401 });
  await assert.rejects(f.service.submit(f.ownerId, { ...data, consentVersion: "" }), { status: 400 });
  await assert.rejects(f.service.submit(f.ownerId, { ...data, selfie: data.governmentId }), { status: 400 });
  for (const key of ["educationRecords", "experienceRecords"]) {
    f.state.profile[0][key][0].status = "DRAFT";
    await assert.rejects(f.service.submit(f.ownerId, data), { status: 403 });
    f.state.profile[0][key][0].status = "VERIFIED";
  }
  f.state.profile[0].headline = "";
  await assert.rejects(f.service.submit(f.ownerId, data), { status: 403 });
  assert.equal(f.state.manualIdentityRequest.length, 0);
  assert(f.state.manualIdentityEvidence.every((r) => r.state === "READY"));
});

test("foreign, expired, wrong-kind, stale-version and reused images cannot attach or leave partial submissions", async () => {
  for (const kind of ["foreign", "expired", "wrong-kind", "stale", "reused"]) {
    const f = manualReviewFixture(), data = f.submission();
    const asset = f.state.manualIdentityEvidence[1];
    if (kind === "foreign") asset.accountId = f.otherId;
    if (kind === "expired") asset.expiresAt = f.now();
    if (kind === "wrong-kind") asset.kind = "GOVERNMENT_ID";
    if (kind === "stale") data.expectedProfileVersion++;
    if (kind === "reused") { asset.state = "ATTACHED"; asset.attemptId = randomUUID(); }
    await assert.rejects(f.service.submit(f.ownerId, data), { status: kind === "stale" ? 409 : 400 });
    assert.equal(f.state.manualIdentityRequest.length, 0);
    assert.equal(f.state.manualIdentityEvidence[0].state, "READY");
  }
});

test("submission snapshots are immutable, retries replay safely and concurrent requests have only one winner", async () => {
  const f = manualReviewFixture(), data = f.submission();
  const results = await Promise.all([f.service.submit(f.ownerId, data), f.service.submit(f.ownerId, data)]);
  assert.equal(results[0].attemptId, results[1].attemptId);
  assert.equal(f.state.manualIdentityAttempt.length, 1); assert.equal(f.state.manualIdentityAudit.length, 1);
  assert.equal(f.state.manualIdentityEvidence.filter((r) => r.state === "ATTACHED").length, 2);
  assert.equal((await f.service.owner(f.ownerId)).identityVerified, false);
  await assert.rejects(f.service.submit(f.ownerId, { ...data, selfie: randomUUID() }), { status: 409 });
  const another = f.submission();
  await assert.rejects(f.service.submit(f.ownerId, another), { status: 409 });
  const attempt = f.state.manualIdentityAttempt[0];
  assert.equal(attempt.snapshot.firstName, "Sample");
  f.state.account[0].person.firstName = "Changed"; f.state.account[0].person.identityRevision++;
  assert.equal(attempt.snapshot.firstName, "Sample");
  assert.equal((await f.service.owner(f.ownerId)).status, "INVALIDATED");
});

test("an audit failure rolls back both evidence attachment and review creation", async () => {
  const f = manualReviewFixture(), data = f.submission(); f.failAudit();
  await assert.rejects(f.service.submit(f.ownerId, data));
  assert.equal(f.state.manualIdentityRequest.length, 0); assert.equal(f.state.manualIdentityAttempt.length, 0);
  assert(f.state.manualIdentityEvidence.every((r) => r.state === "READY" && r.attemptId === null));
});

test("credential reviewer status alone never grants identity review; every privileged entry requires live MFA", async () => {
  const f = manualReviewFixture(); await f.service.submit(f.ownerId, f.submission());
  const request = f.state.manualIdentityRequest[0];
  const operations = [
    () => f.service.access(f.reviewerId, undefined),
    () => f.service.queue(f.reviewerId, undefined),
    () => f.service.detail(f.reviewerId, undefined, request.id),
    () => f.service.transition(f.reviewerId, undefined, request.id, { expectedVersion: request.version }, true),
  ];
  for (const call of operations) await assert.rejects(call(), { status: 403 });
  f.state.manualIdentityReviewer[0].enabled = false;
  f.state.account[1].platformRole = "CREDENTIAL_REVIEWER";
  await assert.rejects(f.service.access(f.reviewerId, f.sessionId), { status: 403 });
  f.state.manualIdentityReviewer[0].enabled = true;
  for (const change of [() => { f.state.session[0].mfaVersion = 0; }, () => { f.state.session[0].mfaVersion = 1; f.state.mfaFactor[0].enabled = false; }]) {
    change(); await assert.rejects(f.service.access(f.reviewerId, f.sessionId), { status: 403 });
  }
});

test("self-review is denied and assignment gates snapshot/evidence access before any approval", async () => {
  const f = manualReviewFixture(); await f.service.submit(f.ownerId, f.submission());
  const request = f.state.manualIdentityRequest[0], asset = f.state.manualIdentityEvidence[0];
  const before = await f.service.detail(f.reviewerId, f.sessionId, request.id);
  assert.equal(before.attempts[0].snapshot, null); assert.deepEqual(before.attempts[0].evidence, []);
  await assert.rejects(f.service.download(f.reviewerId, f.sessionId, asset.id), { status: 403 });
  await f.assign();
  const detail = await f.service.detail(f.reviewerId, f.sessionId, request.id);
  assert.equal(detail.attempts[0].snapshot.firstName, "Sample"); assert.equal(detail.attempts[0].evidence.length, 2);
  assert((await f.service.download(f.reviewerId, f.sessionId, asset.id)).bytes.length > 0);
  assert((await f.service.download(f.ownerId, undefined, asset.id)).bytes.length > 0);
  f.state.manualIdentityReviewer.push({ accountId: f.ownerId, enabled: true });
  f.state.mfaFactor.push({ accountId: f.ownerId, enabled: true, version: 1 });
  const session = { id: randomUUID(), accountId: f.ownerId, expiresAt: new Date(+f.now() + DAY), mfaVerifiedAt: f.now(), mfaVersion: 1 }; f.state.session.push(session);
  await assert.rejects(f.service.detail(f.ownerId, session.id, request.id), { status: 403 });
  await assert.rejects(f.service.transition(f.ownerId, session.id, request.id, { expectedVersion: request.version, attemptId: request.currentAttemptId, status: "APPROVED", note: "Self review is forbidden." }), { status: 403 });
});

test("decisions require assignment, a current attempt/version and attributable reason; failed audits roll back", async () => {
  const f = manualReviewFixture(); await f.service.submit(f.ownerId, f.submission());
  await assert.rejects(f.decide(), { status: 409 });
  await f.assign();
  const request = f.state.manualIdentityRequest[0];
  const base = { expectedVersion: request.version, attemptId: request.currentAttemptId, status: "APPROVED", note: "Evidence reviewed against the snapshot." };
  await assert.rejects(f.service.transition(f.reviewerId, f.sessionId, request.id, { ...base, expectedVersion: request.version - 1 }), { status: 409 });
  await assert.rejects(f.service.transition(f.reviewerId, f.sessionId, request.id, { ...base, attemptId: randomUUID() }), { status: 409 });
  await assert.rejects(f.service.transition(f.reviewerId, f.sessionId, request.id, { ...base, note: "" }), { status: 400 });
  f.failAudit(); await assert.rejects(f.decide());
  assert.equal(f.state.manualIdentityRequest[0].state, "IN_REVIEW");
  f.failAudit(false); await f.decide();
  assert.equal((await f.service.owner(f.ownerId)).identityVerified, true);
  assert.equal(f.state.profile[0].educationRecords[0].status, "VERIFIED");
  assert.equal(f.state.manualIdentityAudit.filter((r) => r.action === "DECIDED").length, 1);
});

test("changes invalidate pending/approved identity, including reverting protected fields; credential trust is separate", async () => {
  const f = manualReviewFixture(); await f.service.submit(f.ownerId, f.submission()); await f.assign(); await f.decide();
  f.state.profile[0].headline = "A harmless new headline"; f.state.profile[0].version++;
  assert.equal((await f.service.owner(f.ownerId)).identityVerified, true);
  const first = f.state.account[0].person.firstName;
  f.state.account[0].person.firstName = "Other"; f.state.account[0].person.identityRevision++;
  assert.equal((await f.service.owner(f.ownerId)).identityVerified, false);
  f.state.account[0].person.firstName = first; f.state.account[0].person.identityRevision++;
  assert.equal((await f.service.owner(f.ownerId)).identityVerified, false);
  assert.equal(f.state.manualIdentityAttempt[0].snapshot.firstName, first);
  const g = manualReviewFixture(); await g.service.submit(g.ownerId, g.submission()); await g.assign();
  g.state.profile[0].educationRecords[0].status = "ACTION_REQUIRED";
  await assert.rejects(g.decide(), { status: 409 });
  assert.equal((await g.service.owner(g.ownerId)).identityVerified, false);
});

test("corrections require fresh images and keep their original target; overdue requests never auto-approve", async () => {
  const f = manualReviewFixture(); await f.service.submit(f.ownerId, f.submission()); await f.assign(); await f.decide("ACTION_REQUIRED");
  const target = +f.state.manualIdentityRequest[0].targetAt, old = f.state.manualIdentityAttempt[0];
  f.advance(6 * DAY);
  const data = f.submission(); await f.service.submit(f.ownerId, data);
  assert.equal(+f.state.manualIdentityRequest[0].targetAt, target);
  assert.equal(f.state.manualIdentityAttempt[0].state, "ACTION_REQUIRED");
  assert.equal(f.state.manualIdentityAttempt[0].snapshot.firstName, "Sample");
  assert.equal(f.state.manualIdentityAttempt[1].revision, 2);
  assert.notEqual(old.id, f.state.manualIdentityAttempt[1].id);
  f.advance(DAY);
  const view = await f.service.owner(f.ownerId);
  assert.equal(view.request.overdue, true); assert.equal(view.identityVerified, false);
});

test("role/MFA revocation during a slow evidence download prevents disclosure and unauthorised downloads stay private", async () => {
  const f = manualReviewFixture(); await f.service.submit(f.ownerId, f.submission()); await f.assign();
  const asset = f.state.manualIdentityEvidence[0];
  await assert.rejects(f.service.download(f.otherId, f.sessionId, asset.id), { status: 403 });
  f.storage.get = async () => { f.state.manualIdentityReviewer[0].enabled = false; return Buffer.from("private"); };
  await assert.rejects(f.service.download(f.reviewerId, f.sessionId, asset.id), { status: 403 });
  f.state.manualIdentityReviewer[0].enabled = true;
  f.storage.get = async () => { f.state.mfaFactor[0].version++; return Buffer.from("private"); };
  await assert.rejects(f.service.download(f.reviewerId, f.sessionId, asset.id), { status: 403 });
});

test("retention purges private snapshots and queues attached images for deletion without losing decision audit", async () => {
  const f = manualReviewFixture(); await f.service.submit(f.ownerId, f.submission()); await f.assign(); await f.decide();
  const decision = f.state.manualIdentityAudit.find(r => r.action === "DECIDED");
  assert.equal(decision.note ?? null, null, "Free-text feedback must not be duplicated into the permanent audit.");
  decision.note = "Legacy sensitive feedback";
  const auditIdentity = { id: decision.id, actorId: decision.actorId, action: decision.action, toState: decision.toState };
  assert((await f.service.owner(f.ownerId)).attempts[0].note);
  f.advance(30 * DAY);
  assert.equal((await f.service.owner(f.ownerId)).attempts[0].note, null, "Retention ends at the exact deadline, before cleanup runs.");
  await assert.rejects(f.service.download(f.ownerId, undefined, f.state.manualIdentityEvidence[0].id), { status: 404 });
  assert.equal((await f.service.owner(f.ownerId)).attempts[0].snapshot, null);
  assert.deepEqual(await f.service.cleanup(), { purged: 1 });
  assert.equal(f.state.manualIdentityAttempt[0].snapshot, null);
  assert.equal(f.state.manualIdentityAttempt[0].note, null);
  const keptAudit = f.state.manualIdentityAudit.find(r => r.id === decision.id);
  assert.equal(keptAudit.note, null);
  assert.deepEqual({ id: keptAudit.id, actorId: keptAudit.actorId, action: keptAudit.action, toState: keptAudit.toState }, auditIdentity);
  assert(f.state.manualIdentityEvidence.every((r) => r.state === "DELETE_PENDING"));
  assert.equal((await f.service.owner(f.ownerId)).identityVerified, true);
  assert(f.state.manualIdentityAudit.some((r) => r.action === "DECIDED"));
  const g = manualReviewFixture(); await g.service.submit(g.ownerId, g.submission()); g.advance(31 * DAY);
  assert.equal((await g.service.owner(g.ownerId)).status, "EXPIRED");
  await g.service.cleanup(); assert.equal(g.state.manualIdentityRequest[0].state, "EXPIRED");
});

test("HTTP owner/reviewer routes require actual session, trusted Origin and MFA; inputs cannot grant ownership or trust", async () => {
  const f = manualReviewFixture(), app = express(); app.use(express.json());
  app.use("/api/v1", createManualIdentityReviewRoutes({ reviews: f.service, sessions: { async authenticate(token) {
    if (!["owner", "reviewer", "password-only"].includes(token)) throw Object.assign(Error("Login required"), { status: 401 });
    return { account: { id: token === "owner" ? f.ownerId : f.reviewerId }, sessionId: f.sessionId, mfaVerified: token === "reviewer" };
  } }, clientUrl: "http://localhost:5173", nodeEnv: "test", limiter: (req, res, next) => next() }));
  app.use((error, req, res, next) => { void next; res.status(error.status ?? 500).json({ success: false, message: error.message }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`, headers = { "Content-Type": "application/json", Cookie: "brightway_session=owner", Origin: "http://localhost:5173" };
  try {
    assert.equal((await fetch(`${base}/manual-identity`)).status, 401);
    assert.equal((await fetch(`${base}/manual-identity/status`)).status, 401);
    const statusResponse = await fetch(`${base}/manual-identity/status`, { headers });
    assert.equal(statusResponse.status, 200); assert.equal(statusResponse.headers.get("cache-control"), "no-store");
    assert.deepEqual((await statusResponse.json()).data, { accountId: f.ownerId, profileVersion: 1, status: "NOT_STARTED", identityVerified: false, identityDetailsComplete: true, canSubmit: true });
    const data = f.submission();
    assert.equal((await fetch(`${base}/manual-identity/submit`, { method: "POST", headers: { ...headers, Origin: "https://foreign.invalid" }, body: JSON.stringify(data) })).status, 403);
    assert.equal((await fetch(`${base}/manual-identity/submit`, { method: "POST", headers, body: JSON.stringify({ ...data, identityVerified: true }) })).status, 400);
    const submitted = await fetch(`${base}/manual-identity/submit`, { method: "POST", headers, body: JSON.stringify(data) });
    assert.equal(submitted.status, 200); assert.equal(submitted.headers.get("cache-control"), "no-store");
    assert.equal((await fetch(`${base}/admin/manual-identity/access`, { headers: { Cookie: "brightway_session=password-only" } })).status, 403);
    assert.equal((await fetch(`${base}/admin/manual-identity/access`, { headers: { Cookie: "brightway_session=reviewer" } })).status, 200);
    const owner = await fetch(`${base}/manual-identity`, { headers });
    const serialized = JSON.stringify(await owner.json());
    for (const word of ["storageKey", "inputHash", "identityHash", "idempotencyKey"]) assert(!serialized.includes(word));
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("five submissions per rolling day are enforced across service recreation, without counting retries", async () => {
  const f = manualReviewFixture(); await f.service.submit(f.ownerId, f.submission()); await f.assign(); await f.decide("ACTION_REQUIRED");
  f.state.manualIdentityRequest[0].submissionCount = 5;
  const recreated = createManualIdentityReviewService({ prisma: f.db, storage: f.storage, now: f.now, policy: f.policy });
  await assert.rejects(recreated.submit(f.ownerId, f.submission()), { status: 429 });
});

test("MFA expiry during the decision transaction prevents the decision and audit from committing", async () => {
  const f = manualReviewFixture(); await f.service.submit(f.ownerId, f.submission()); await f.assign();
  const original = f.db.manualIdentityAudit.create;
  f.db.manualIdentityAudit.create = async (args) => {
    const event = await original(args);
    if (args.data.action === "DECIDED") f.advance(8 * DAY);
    return event;
  };
  await assert.rejects(f.decide(), { status: 403 });
  assert.equal(f.state.manualIdentityRequest[0].state, "IN_REVIEW");
  assert.equal(f.state.manualIdentityAudit.filter((r) => r.action === "DECIDED").length, 0);
});

test("lightweight identity status binds the owner/profile version and never reads private evidence or attempt history", async () => {
  const f = manualReviewFixture();
  assert.deepEqual(await f.service.status(f.ownerId), { accountId: f.ownerId, profileVersion: 1, status: "NOT_STARTED", identityVerified: false, identityDetailsComplete: true, canSubmit: true });
  await f.service.submit(f.ownerId, f.submission()); await f.assign(); await f.decide();
  f.db.manualIdentityEvidence.findMany = async () => { throw Error("Private evidence must not be loaded by the status endpoint"); };
  f.db.manualIdentityAttempt.findMany = async () => { throw Error("History must not be loaded by the status endpoint"); };
  assert.deepEqual(await f.service.status(f.ownerId), { accountId: f.ownerId, profileVersion: 1, status: "APPROVED", identityVerified: true, identityDetailsComplete: true, canSubmit: false });
});
test("only an effective approval grants the profile badge; submitted, pending, declined and corrections remain unverified", async () => {
  const f = manualReviewFixture(); await f.service.submit(f.ownerId, f.submission());
  assert.deepEqual((await f.service.status(f.ownerId)), { accountId: f.ownerId, profileVersion: 1, status: "SUBMITTED", identityVerified: false, identityDetailsComplete: true, canSubmit: false });
  await f.assign(); assert.equal((await f.service.status(f.ownerId)).identityVerified, false);
  await f.decide("ACTION_REQUIRED"); assert.equal((await f.service.status(f.ownerId)).identityVerified, false);
  assert.equal((await f.service.status(f.ownerId)).canSubmit, true);
  await f.service.submit(f.ownerId, f.submission()); await f.assign(); await f.decide("DECLINED");
  assert.equal((await f.service.status(f.ownerId)).identityVerified, false);
});
test("status removes trust after protected-field or bound credential changes even if raw saved request state is APPROVED", async () => {
  for (const field of ["name", "education", "experience", "photo", "country"]) {
    const f = manualReviewFixture(); await f.service.submit(f.ownerId, f.submission()); await f.assign(); await f.decide();
    if (field === "name") { f.state.account[0].person.identityRevision++; }
    else if (field === "photo") { f.state.profile[0].photo.id = randomUUID(); f.state.profile[0].identityRevision++; }
    else if (field === "country") { f.state.profile[0].countryCode = "CA"; f.state.profile[0].identityRevision++; }
    else f.state.profile[0][`${field}Records`][0].revision++;
    const result = await f.service.status(f.ownerId); assert.equal(result.status, "INVALIDATED"); assert.equal(result.identityVerified, false);
    assert.equal(f.state.manualIdentityRequest[0].state, "APPROVED");
  }
});
test("unrelated saved edits update the status profile version without erasing valid approval; purging evidence does not manufacture revocation", async () => {
  const f = manualReviewFixture(); await f.service.submit(f.ownerId, f.submission()); await f.assign(); await f.decide();
  f.state.profile[0].version++; f.state.profile[0].headline = "Updated headline";
  assert.equal((await f.service.status(f.ownerId)).profileVersion, 2); assert.equal((await f.service.status(f.ownerId)).identityVerified, true);
  f.advance(31 * DAY); await f.service.cleanup();
  assert.equal((await f.service.status(f.ownerId)).identityVerified, true);
  f.state.account[0].status = "SUSPENDED";
  await assert.rejects(f.service.status(f.ownerId), { status: 403 });
});

test("review retention and object cleanup compose safely through grace periods, storage failure and retry", async () => {
  const { createManualIdentityEvidenceService } = await import("../src/modules/manual-identity/manual-identity-evidence.service.js");
  const f = manualReviewFixture(), data = f.submission(), objects = new Map(f.state.manualIdentityEvidence.map((a) => [a.storageKey, Buffer.from("synthetic private image")]));
  let unavailable = false;
  f.storage.delete = async (key) => { if (unavailable) throw Error("Synthetic storage outage"); objects.delete(key); };
  const files = createManualIdentityEvidenceService({ prisma: f.db, storage: f.storage, now: f.now });
  await f.service.submit(f.ownerId, data); await f.assign(); await f.decide();
  f.advance(31 * DAY);
  assert.deepEqual(await files.cleanup(), { deleted: 0, failed: 0 }); assert.equal(objects.size, 2);
  await assert.rejects(f.service.download(f.ownerId, undefined, f.state.manualIdentityEvidence[0].id), { status: 404 });
  assert.deepEqual(await f.service.cleanup(), { purged: 1 }); assert.equal(f.state.manualIdentityAttempt[0].snapshot, null);
  assert.deepEqual(await files.cleanup(), { deleted: 0, failed: 0 }); assert.equal(objects.size, 2);
  f.advance(11 * 60000); unavailable = true;
  assert.deepEqual(await files.cleanup(), { deleted: 0, failed: 2 }); assert.equal(objects.size, 2);
  assert(f.state.manualIdentityEvidence.every((a) => a.state === "DELETE_PENDING"));
  f.advance(11 * 60000); unavailable = false;
  assert.deepEqual(await files.cleanup(), { deleted: 2, failed: 0 }); assert.equal(objects.size, 0);
  assert(f.state.manualIdentityEvidence.every((a) => a.state === "DELETED"));
  assert.deepEqual(await files.cleanup(), { deleted: 0, failed: 0 }); assert.deepEqual(await f.service.cleanup(), { purged: 0 });
  assert.equal((await f.service.status(f.ownerId)).identityVerified, true);
  assert.equal(f.state.manualIdentityAudit.filter((a) => a.action === "DECIDED").length, 1);
  assert.equal(f.state.manualIdentityAudit.filter((a) => a.action === "EVIDENCE_RETENTION_ENDED").length, 1);
});


test("unassigned reviewers cannot read feedback, and cleanup repairs previously purged feedback idempotently", async () => {
  const f = manualReviewFixture(); await f.service.submit(f.ownerId, f.submission()); await f.assign(); await f.decide();
  const request = f.state.manualIdentityRequest[0];
  f.state.manualIdentityAttempt[0].reviewerId = f.otherId;
  assert.equal((await f.service.detail(f.reviewerId, f.sessionId, request.id)).attempts[0].note, null);
  assert((await f.service.owner(f.ownerId)).attempts[0].note);
  f.advance(31 * DAY); await f.service.cleanup();
  const attempt = f.state.manualIdentityAttempt[0], audit = f.state.manualIdentityAudit.find(r => r.action === "DECIDED");
  attempt.note = "Previously retained feedback"; audit.note = "Legacy duplicate feedback";
  const count = f.state.manualIdentityAudit.length;
  assert.deepEqual(await f.service.cleanup(), { purged: 0 });
  assert.equal(attempt.note, null); assert.equal(audit.note, null);
  assert.equal(f.state.manualIdentityAudit.length, count);
  assert.deepEqual(await f.service.cleanup(), { purged: 0 });
  assert.equal((await f.service.owner(f.ownerId)).identityVerified, true);
});

test("failed retention audit rolls feedback and evidence cleanup back together for a safe retry", async () => {
  const f = manualReviewFixture(); await f.service.submit(f.ownerId, f.submission()); await f.assign(); await f.decide();
  f.state.manualIdentityAudit.find(r => r.action === "DECIDED").note = "Legacy private feedback";
  f.advance(30 * DAY); f.failAudit();
  await assert.rejects(f.service.cleanup(), /Audit storage failed/);
  assert(f.state.manualIdentityAttempt[0].note); assert(f.state.manualIdentityAttempt[0].snapshot);
  assert.equal(f.state.manualIdentityAttempt[0].purgedAt, null);
  assert(f.state.manualIdentityEvidence.every(r => r.state === "ATTACHED"));
  assert(f.state.manualIdentityAudit.find(r => r.action === "DECIDED").note);
  assert.equal((await f.service.owner(f.ownerId)).attempts[0].note, null);
  f.failAudit(false); assert.deepEqual(await f.service.cleanup(), { purged: 1 });
  assert.equal((await f.service.owner(f.ownerId)).identityVerified, true);
});
