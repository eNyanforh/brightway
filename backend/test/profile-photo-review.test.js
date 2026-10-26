import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { manualReviewFixture } from "../test-support/manual-identity-review-fixture.js";
import { createPhotoService } from "../src/modules/photos/photo.service.js";
import { createProfilePhotoReviewService } from "../src/modules/photos/profile-photo-review.service.js";
import { createProfilePhotoReviewRoutes } from "../src/modules/photos/profile-photo-review.routes.js";

async function fixture() {
  const f = manualReviewFixture();
  await f.service.submit(f.ownerId, f.submission()); await f.assign(); await f.decide();
  const oldPhotoId = f.state.profile[0].photoId;
  const objects = new Map([["old/profile.webp", Buffer.from("old image")]]);
  f.storage.put = async (key, bytes) => objects.set(key, bytes);
  f.storage.get = async (key) => { if (!objects.has(key)) throw Error("missing image"); return objects.get(key); };
  f.storage.delete = async (key) => objects.delete(key);
  const photos = createPhotoService({ prisma: f.db, storage: f.storage, now: f.now,
    process: async () => ({ bytes: Buffer.from("replacement"), width: 256, height: 256 }) });
  const reviews = createProfilePhotoReviewService({ prisma: f.db, storage: f.storage, now: f.now });
  const pending = () => f.state.profilePhotoReview.find((r) => ["PENDING", "IN_REVIEW"].includes(r.state));
  const upload = () => photos.uploadOwner(f.state.profile[0].personId, f.state.profile[0].version, Buffer.from("input"), "image/png");
  const assign = () => reviews.assign(f.reviewerId, f.sessionId, pending().id, { expectedVersion: pending().version });
  const decide = (decision = "APPROVED", extra = {}) => reviews.decide(f.reviewerId, f.sessionId, pending().id, {
    expectedVersion: pending().version, expectedProfileVersion: f.state.profile[0].version,
    decision, note: "Replacement photo reviewed against the current approved portrait.", ...extra,
  });
  return { ...f, photos, reviews, objects, oldPhotoId, pending, upload, assignPhoto: assign, decidePhoto: decide };
}

test("a verified photo replacement stays private, retains the current portrait and badge, and reports only safe metadata", async () => {
  const f = await fixture(), version = f.state.profile[0].version;
  assert.equal(f.state.account[0].photoReviewRequired, true);
  const result = await f.upload();
  assert.equal(result.photoAssetId, f.oldPhotoId); assert.equal(result.profileVersion, version + 1);
  assert.equal(result.photoReview.pending.state, "PENDING");
  assert.equal(f.state.profile[0].photoId, f.oldPhotoId);
  assert.equal((await f.service.status(f.ownerId)).identityVerified, true);
  assert.deepEqual(await f.photos.readOwner(f.state.profile[0].personId, result.uploadedPhotoAssetId), Buffer.from("replacement"));
  await assert.rejects(f.photos.readOwner("foreign-person", result.uploadedPhotoAssetId), { status: 404 });
  const projection = JSON.stringify(result);
  for (const word of ["storageKey", "baseIdentityHash", "approvedIdentityHash", "birthDate"]) assert(!projection.includes(word));
  assert.equal(f.state.photoAsset.find((p) => p.id === f.oldPhotoId).state, "CLAIMED");
});

test("an upload rechecks the review gate after waiting for an identity approval account lock", async () => {
  const f = await fixture();
  f.state.account[0].photoReviewRequired = false;
  const lock = f.db.account.updateMany;
  let approvalCommitted = false;
  f.db.account.updateMany = async (args) => {
    if (!approvalCommitted && args.where.id === f.ownerId) {
      // Model approval committing between the lookup and lock acquisition.
      f.state.account[0].photoReviewRequired = true;
      approvalCommitted = true;
    }
    return lock(args);
  };
  const result = await f.upload();
  assert.equal(approvalCommitted, true);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.photoAssetId, f.oldPhotoId);
  assert.equal(f.pending().candidatePhotoId, result.uploadedPhotoAssetId);
  assert.equal(f.state.profile[0].photoId, f.oldPhotoId);
  assert.equal((await f.service.status(f.ownerId)).identityVerified, true);
});

test("assigned MFA approval replaces the portrait and attests the exact new identity hash without rewriting the original snapshot", async () => {
  const f = await fixture(), attemptBefore = structuredClone(f.state.manualIdentityAttempt[0]);
  const result = await f.upload(), row = f.pending();
  assert.equal((await f.reviews.detail(f.reviewerId, f.sessionId, row.id)).imagesAvailable, false);
  await assert.rejects(f.reviews.image(f.reviewerId, f.sessionId, row.id, "candidate"), { status: 403 });
  await f.assignPhoto();
  assert.deepEqual(await f.reviews.image(f.reviewerId, f.sessionId, row.id, "candidate"), Buffer.from("replacement"));
  await f.decidePhoto();
  assert.equal(f.state.profile[0].photoId, result.uploadedPhotoAssetId);
  assert.equal((await f.service.status(f.ownerId)).identityVerified, true);
  assert(f.state.profilePhotoReview[0].approvedIdentityHash);
  assert.deepEqual(f.state.manualIdentityAttempt[0].snapshot, attemptBefore.snapshot);
  assert.equal(f.state.manualIdentityAttempt[0].identityHash, attemptBefore.identityHash);
  assert.equal(f.state.photoAsset.find((p) => p.id === f.oldPhotoId).state, "DELETE_PENDING");
  assert.equal(f.state.profilePhotoReviewAudit.filter((e) => e.action === "DECIDED").length, 1);
  assert.equal(f.state.profilePhotoReviewAudit.filter((e) => e.action === "IMAGE_VIEWED").length, 1);
  const name = f.state.account[0].person.firstName;
  f.state.account[0].person.firstName = "Changed"; f.state.account[0].person.identityRevision++;
  f.state.account[0].person.firstName = name; f.state.account[0].person.identityRevision++;
  assert.equal((await f.service.status(f.ownerId)).identityVerified, false);
});

test("successive approved replacements preserve the original identity anchor, while credential revocation still invalidates trust", async () => {
  const f = await fixture();
  for (let n = 0; n < 3; n++) { await f.upload(); await f.assignPhoto(); await f.decidePhoto(); assert.equal((await f.service.status(f.ownerId)).identityVerified, true); }
  assert.equal(new Set(f.state.profilePhotoReview.map((r) => r.identityAttemptId)).size, 1);
  f.state.profile[0].educationRecords[0].revision++;
  assert.equal((await f.service.status(f.ownerId)).identityVerified, false);
});

test("declining or cancelling never publishes the candidate or removes an otherwise valid identity", async () => {
  const f = await fixture(); await f.upload(); const id = f.pending().id; await f.assignPhoto(); await f.decidePhoto("DECLINED");
  assert.equal(f.state.profile[0].photoId, f.oldPhotoId);
  assert.equal((await f.service.status(f.ownerId)).identityVerified, true);
  const declined = f.state.profilePhotoReview.find((r) => r.id === id);
  assert.equal(f.state.photoAsset.find((a) => a.id === declined.candidatePhotoId).state, "DELETE_PENDING");
  await f.upload(); const pending = f.pending();
  await assert.rejects(f.reviews.cancel(f.otherId, pending.id, { expectedVersion: pending.version, expectedProfileVersion: f.state.profile[0].version }), { status: 404 });
  await f.reviews.cancel(f.ownerId, pending.id, { expectedVersion: pending.version, expectedProfileVersion: f.state.profile[0].version });
  assert.equal(f.state.profile[0].photoId, f.oldPhotoId); assert.equal(f.pending(), undefined);
  assert.equal((await f.service.status(f.ownerId)).identityVerified, true);
});

test("replacement supersession and cancellation protect the current photo during storage cleanup", async () => {
  const f = await fixture(); const first = await f.upload(); const oldReviewId = f.pending().id;
  const second = await f.upload();
  assert.equal(f.state.profilePhotoReview.find((r) => r.id === oldReviewId).state, "SUPERSEDED");
  assert.equal(second.photoReview.pending.photoAssetId, second.uploadedPhotoAssetId);
  await f.photos.cleanup();
  assert.equal(f.state.photoAsset.find((a) => a.id === first.uploadedPhotoAssetId).state, "DELETED");
  assert.equal(f.state.photoAsset.find((a) => a.id === f.oldPhotoId).state, "CLAIMED");
  assert.equal(f.state.photoAsset.find((a) => a.id === second.uploadedPhotoAssetId).state, "CLAIMED");
});

test("losing eligibility cannot bypass the post-verification gate and photo approval cannot repair revoked credential trust", async () => {
  const f = await fixture(); f.state.profile[0].experienceRecords[0].status = "DRAFT";
  await f.upload(); assert.equal(f.state.profile[0].photoId, f.oldPhotoId);
  await f.assignPhoto(); await f.decidePhoto();
  assert.equal(f.state.profilePhotoReview[0].approvedIdentityHash, null);
  assert.equal((await f.service.status(f.ownerId)).identityVerified, false);
});

test("review requires current assignment/version and rejects self review, privilege injection and protected identity drift", async () => {
  const f = await fixture(); await f.upload(); const row = f.pending();
  await assert.rejects(f.decidePhoto(), { status: 403 });
  await f.assignPhoto();
  await assert.rejects(f.decidePhoto("APPROVED", { identityVerified: true }), { status: 400 });
  await assert.rejects(f.decidePhoto("APPROVED", { expectedVersion: 1 }), { status: 409 });
  await assert.rejects(f.decidePhoto("APPROVED", { expectedProfileVersion: 0 }), { status: 409 });
  f.state.manualIdentityReviewer.push({ accountId: f.ownerId, enabled: true });
  f.state.mfaFactor.push({ accountId: f.ownerId, enabled: true, version: 1 });
  const ownSession = randomUUID(); f.state.session.push({ id: ownSession, accountId: f.ownerId, expiresAt: new Date(+f.now() + 86400000), mfaVerifiedAt: f.now(), mfaVersion: 1 });
  await assert.rejects(f.reviews.detail(f.ownerId, ownSession, row.id), { status: 403 });
  f.state.account[0].person.identityRevision++;
  assert.equal((await f.reviews.detail(f.reviewerId, f.sessionId, row.id)).stale, true);
  await assert.rejects(f.decidePhoto(), { status: 409 });
  assert.equal(f.state.profile[0].photoId, f.oldPhotoId);
});

test("audit failure and MFA revocation roll back approval, photo swap and trust attestation together", async () => {
  const f = await fixture(); await f.upload(); await f.assignPhoto(); f.failAudit();
  await assert.rejects(f.decidePhoto()); assert.equal(f.pending().state, "IN_REVIEW");
  assert.equal(f.state.profile[0].photoId, f.oldPhotoId); assert.equal(f.pending().approvedIdentityHash, null);
  f.failAudit(false);
  const original = f.db.profilePhotoReviewAudit.create;
  f.db.profilePhotoReviewAudit.create = async (args) => { const value = await original(args); if (args.data.action === "DECIDED") f.state.mfaFactor[0].version++; return value; };
  await assert.rejects(f.decidePhoto(), { status: 403 });
  assert.equal(f.state.profile[0].photoId, f.oldPhotoId); assert.equal(f.pending().state, "IN_REVIEW");
  assert.equal(f.state.profilePhotoReviewAudit.filter((e) => e.action === "DECIDED").length, 0);
});

test("a failed upload audit leaves retriable candidate cleanup while retaining the approved portrait", async () => {
  const f = await fixture(); f.failAudit();
  await assert.rejects(f.upload());
  assert.equal(f.state.profile[0].photoId, f.oldPhotoId);
  assert.equal(f.state.profilePhotoReview.length, 0);
  assert.equal(f.state.photoAsset.filter((a) => a.state === "DELETE_PENDING").length, 1);
});

test("competing photo decisions have one winner and a slow image fetch rechecks revoked permission", async () => {
  const f = await fixture(); await f.upload(); await f.assignPhoto(); const row = structuredClone(f.pending());
  const input = { expectedVersion: row.version, expectedProfileVersion: f.state.profile[0].version, decision: "APPROVED", note: "A clear reviewer decision for this exact candidate." };
  const results = await Promise.allSettled([1, 2].map(() => f.reviews.decide(f.reviewerId, f.sessionId, row.id, input)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.find((r) => r.status === "rejected").reason.status, 409);
  const g = await fixture(); await g.upload(); await g.assignPhoto();
  g.storage.get = async () => { g.state.manualIdentityReviewer[0].enabled = false; return Buffer.from("private"); };
  await assert.rejects(g.reviews.image(g.reviewerId, g.sessionId, g.pending().id, "candidate"), { status: 403 });
});

test("photo HTTP routes enforce trusted Origin, session, live MFA and private assigned-image access", async () => {
  const f = await fixture(); await f.upload(); const row = f.pending(); const app = express(); app.use(express.json());
  app.use("/api/v1", createProfilePhotoReviewRoutes({ reviews: f.reviews, sessions: { async authenticate(token) {
    if (!["owner", "reviewer", "password-only"].includes(token)) throw Object.assign(Error("Login required"), { status: 401 });
    return { account: { id: token === "owner" ? f.ownerId : f.reviewerId }, sessionId: f.sessionId, mfaVerified: token === "reviewer" };
  } }, clientUrl: "http://localhost:5173", nodeEnv: "test", limiter: (req, res, next) => next() }));
  app.use((e, req, res, next) => { void next; res.status(e.status ?? 500).json({ success: false, message: e.message }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/admin/profile-photos`;
  const headers = { Cookie: "brightway_session=reviewer", "Content-Type": "application/json", Origin: "http://localhost:5173" };
  try {
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(base, { headers: { Cookie: "brightway_session=password-only" } })).status, 403);
    const queue = await fetch(base, { headers }); assert.equal(queue.status, 200); assert.equal(queue.headers.get("cache-control"), "no-store");
    assert.equal((await fetch(`${base}/${row.id}/images/candidate`, { headers })).status, 403);
    assert.equal((await fetch(`${base}/${row.id}/assign`, { method: "POST", headers: { ...headers, Origin: "https://foreign.invalid" }, body: JSON.stringify({ expectedVersion: row.version }) })).status, 403);
    assert.equal((await fetch(`${base}/${row.id}/assign`, { method: "POST", headers, body: JSON.stringify({ expectedVersion: row.version }) })).status, 200);
    const image = await fetch(`${base}/${row.id}/images/candidate`, { headers });
    assert.equal(image.status, 200); assert.equal(image.headers.get("cache-control"), "no-store"); assert.equal(image.headers.get("content-type"), "image/webp");
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("a fresh valid identity decision during a pending photo review can anchor approval without reviving the superseded proof", async () => {
  const f = await fixture(); await f.upload();
  const originalAttempt = f.state.manualIdentityAttempt[0].id;
  f.state.profile[0].educationRecords[0].revision++;
  assert.equal((await f.service.status(f.ownerId)).identityVerified, false);
  await f.service.submit(f.ownerId, f.submission()); await f.assign(); await f.decide();
  const currentAttempt = f.state.manualIdentityRequest[0].currentAttemptId;
  assert.notEqual(currentAttempt, originalAttempt);
  await f.assignPhoto(); await f.decidePhoto();
  assert.equal(f.state.profilePhotoReview[0].identityAttemptId, currentAttempt);
  assert.equal((await f.service.status(f.ownerId)).identityVerified, true);
});
