import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createManualIdentityReviewService } from "../src/modules/manual-identity/manual-identity-review.service.js";
import { createManualIdentityEvidenceService, MANUAL_IDENTITY_CONSENT } from "../src/modules/manual-identity/manual-identity-evidence.service.js";
import { reviewPolicy, MANUAL_REVIEW_CONSENT } from "../src/modules/manual-identity/manual-identity.policy.js";
import { createPhotoService } from "../src/modules/photos/photo.service.js";
import { createProfilePhotoReviewService } from "../src/modules/photos/profile-photo-review.service.js";

test("database verified photo reviews serialize decisions, retain the approved portrait, preserve immutable identity and cannot revive changed identity", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const date = new Date(), marker = randomUUID(), accounts = [], objects = new Map();
  const storage = { check() {}, async put(key, bytes) { objects.set(key, bytes); }, async get(key) { if (!objects.has(key)) throw Error("Fixture image missing"); return objects.get(key); }, async delete(key) { objects.delete(key); } };
  const now = () => date;
  const identities = createManualIdentityReviewService({ prisma: db, storage, now, policy: reviewPolicy({ MANUAL_IDENTITY_RETENTION_DAYS: "30" }) });
  const evidence = createManualIdentityEvidenceService({ prisma: db, storage, now, processImage: async () => ({ bytes: Buffer.from("identity fixture"), width: 640, height: 480 }) });
  const photos = createPhotoService({ prisma: db, storage, now, process: async () => ({ bytes: Buffer.from("photo fixture"), width: 256, height: 256 }) });
  const reviews = createProfilePhotoReviewService({ prisma: db, storage, now });
  try {
    for (const label of ["owner", "reviewer"]) accounts.push(await db.account.create({ data: {
      username: `${label}_${marker.replaceAll("-", "")}`, email: `${label}_${marker}@example.invalid`, emailVerifiedAt: date, passwordHash: "fixture-only-not-a-login-hash",
      person: { create: { firstName: "Photo", lastName: label, birthDate: new Date("2000-01-01"), gender: "MALE", phoneNumber: "+231770000000" } },
    } }));
    const [owner, reviewer] = accounts;
    const old = await db.photoAsset.create({ data: { personId: owner.personId, storageKey: `photo-review-fixture/${marker}`, state: "CLAIMED", expiresAt: new Date(+date + 86400000) } });
    objects.set(old.storageKey, Buffer.from("old portrait"));
    const profile = await db.profile.create({ data: {
      personId: owner.personId, version: 1, photoId: old.id, countryCode: "US", locality: "City", headline: "Developer", careerFieldMode: "EXPLORING", skills: ["JavaScript"], interests: ["Technology"], educationMode: "RECORDS", experienceMode: "RECORDS",
      educationRecords: { create: { institution: "Fixture school", qualification: "Diploma", startMonth: "2018-09", endMonth: "2020-06", current: false, description: "", status: "VERIFIED" } },
      experienceRecords: { create: { organization: "Fixture employer", role: "Developer", type: "EMPLOYMENT", startMonth: "2020-07", endMonth: "2023-06", current: false, description: "", status: "VERIFIED" } },
    } });
    const images = [];
    for (const kind of ["GOVERNMENT_ID", "SELFIE"]) images.push(await evidence.upload(owner.id, kind, Buffer.from("input"), "image/png", MANUAL_IDENTITY_CONSENT));
    const identity = await identities.submit(owner.id, { expectedVersion: 0, expectedProfileVersion: 1, idempotencyKey: randomUUID(), governmentId: images[0].id, selfie: images[1].id, consentVersion: MANUAL_REVIEW_CONSENT });
    await db.manualIdentityReviewer.create({ data: { accountId: reviewer.id, enabled: true } });
    await db.mfaFactor.create({ data: { accountId: reviewer.id, encryptedSecret: "fixture-only", enabled: true, version: 1, windowStart: date } });
    const session = await db.session.create({ data: { accountId: reviewer.id, tokenHash: randomUUID(), expiresAt: new Date(+date + 7 * 86400000), mfaVersion: 1, mfaVerifiedAt: date } });
    await identities.transition(reviewer.id, session.id, identity.requestId, { expectedVersion: 1 }, true);
    // Pause after the uploader's initial account lookup. Approval commits before
    // it acquires the account lock, reproducing the stale-gate race on real SQL.
    let entered, resume;
    const lookup = new Promise((resolve) => { entered = resolve; });
    const continueUpload = new Promise((resolve) => { resume = resolve; });
    const racingDb = new Proxy(db, { get(target, property) {
      if (property !== "$transaction") return Reflect.get(target, property);
      return (work) => target.$transaction((tx) => work(new Proxy(tx, { get(inner, key) {
        if (key !== "account") return Reflect.get(inner, key);
        return new Proxy(inner.account, { get(model, method) {
          if (method !== "findUnique") return Reflect.get(model, method);
          return async (args) => {
            const row = await model.findUnique(args);
            if (args.where.personId === owner.personId) { entered(); await continueUpload; }
            return row;
          };
        } });
      } })));
    } });
    const racingPhotos = createPhotoService({ prisma: racingDb, storage, now, process: async () => ({ bytes: Buffer.from("photo fixture"), width: 256, height: 256 }) });
    const racingUpload = racingPhotos.uploadOwner(owner.personId, 1, Buffer.from("input"), "image/png");
    const settledUpload = Promise.allSettled([racingUpload]);
    try {
      await Promise.race([lookup, racingUpload.then(() => { throw Error("Upload completed without reaching the account lookup barrier."); })]);
      await identities.transition(reviewer.id, session.id, identity.requestId, { expectedVersion: 2, attemptId: identity.attemptId, status: "APPROVED", note: "Fixture-only identity evidence reviewed and matched." });
    } finally { resume(); await settledUpload; }
    const [racingResult] = await settledUpload;
    if (racingResult.status === "rejected") throw racingResult.reason;
    assert.equal((await db.account.findUnique({ where: { id: owner.id } })).photoReviewRequired, true);
    const immutable = await db.manualIdentityAttempt.findUnique({ where: { id: identity.attemptId } });
    async function upload() {
      const current = await db.profile.findUnique({ where: { id: profile.id } });
      return photos.uploadOwner(owner.personId, current.version, Buffer.from("input"), "image/png");
    }
    const replacement = racingResult.value; const reviewId = replacement.photoReview.pending.id;
    assert.equal(replacement.reviewRequired, true, "An upload started before approval must honor the gate after approval commits.");
    assert.equal(replacement.photoAssetId, old.id);
    assert.equal((await db.profile.findUnique({ where: { id: profile.id } })).photoId, old.id);
    assert.equal((await identities.status(owner.id)).identityVerified, true);
    const assignments = await Promise.allSettled([1, 2].map(() => reviews.assign(reviewer.id, session.id, reviewId, { expectedVersion: 1 })));
    assert.equal(assignments.filter((r) => r.status === "fulfilled").length, 1);
    const detail = await reviews.detail(reviewer.id, session.id, reviewId);
    assert.deepEqual(await reviews.image(reviewer.id, session.id, reviewId, "current"), Buffer.from("old portrait"));
    const input = { expectedVersion: detail.version, expectedProfileVersion: detail.profileVersion, decision: "APPROVED", note: "Fixture-only replacement compared with the approved portrait." };
    const decisions = await Promise.allSettled([1, 2].map(() => reviews.decide(reviewer.id, session.id, reviewId, input)));
    assert.equal(decisions.filter((r) => r.status === "fulfilled").length, 1);
    const published = await db.profile.findUnique({ where: { id: profile.id } });
    assert.equal(published.photoId, replacement.uploadedPhotoAssetId); assert.equal(published.identityRevision, 1);
    assert.equal((await identities.status(owner.id)).identityVerified, true);
    const unchanged = await db.manualIdentityAttempt.findUnique({ where: { id: identity.attemptId } });
    assert.deepEqual(unchanged.snapshot, immutable.snapshot); assert.equal(unchanged.identityHash, immutable.identityHash);
    assert.equal(await db.profilePhotoReviewAudit.count({ where: { reviewId, action: "DECIDED" } }), 1);
    assert.equal(await db.profilePhotoReview.count({ where: { accountId: owner.id, state: { in: ["PENDING", "IN_REVIEW"] } } }), 0);
    await photos.cleanup(); assert.equal(objects.has(old.storageKey), false);
    assert.equal((await db.photoAsset.findUnique({ where: { id: replacement.uploadedPhotoAssetId } })).state, "CLAIMED");
    const second = await upload(); const secondId = second.photoReview.pending.id;
    await reviews.assign(reviewer.id, session.id, secondId, { expectedVersion: 1 });
    const next = await reviews.detail(reviewer.id, session.id, secondId);
    const beforeFailure = await db.profile.findUnique({ where: { id: profile.id } });
    const failingDb = new Proxy(db, { get(target, property) {
      if (property !== "$transaction") return Reflect.get(target, property);
      return (work) => target.$transaction((tx) => work(new Proxy(tx, { get(inner, key) {
        if (key !== "profilePhotoReviewAudit") return Reflect.get(inner, key);
        return new Proxy(inner.profilePhotoReviewAudit, { get(model, method) {
          if (method !== "create") return Reflect.get(model, method);
          return (args) => { if (args.data.action === "DECIDED") throw Error("Synthetic audit failure"); return model.create(args); };
        } });
      } })));
    } });
    const failedReviews = createProfilePhotoReviewService({ prisma: failingDb, storage, now });
    await assert.rejects(failedReviews.decide(reviewer.id, session.id, secondId, { expectedVersion: next.version, expectedProfileVersion: next.profileVersion, decision: "APPROVED", note: "Synthetic audit failure must roll back this entire approval." }), /Synthetic audit failure/);
    const afterFailure = await db.profile.findUnique({ where: { id: profile.id } });
    assert.equal(afterFailure.photoId, beforeFailure.photoId); assert.equal(afterFailure.version, beforeFailure.version);
    assert.equal(afterFailure.identityRevision, beforeFailure.identityRevision);
    const failedRow = await db.profilePhotoReview.findUnique({ where: { id: secondId } });
    assert.equal(failedRow.state, "IN_REVIEW"); assert.equal(failedRow.approvedIdentityHash, null);
    assert.equal(await db.profilePhotoReviewAudit.count({ where: { reviewId: secondId, action: "DECIDED" } }), 0);
    assert.equal((await identities.status(owner.id)).identityVerified, true);
    await db.manualIdentityReviewer.update({ where: { accountId: reviewer.id }, data: { enabled: false } });
    await assert.rejects(reviews.decide(reviewer.id, session.id, secondId, { expectedVersion: next.version, expectedProfileVersion: next.profileVersion, decision: "APPROVED", note: "This revoked reviewer must not publish a replacement." }), { status: 403 });
    await db.manualIdentityReviewer.update({ where: { accountId: reviewer.id }, data: { enabled: true } });
    await reviews.decide(reviewer.id, session.id, secondId, { expectedVersion: next.version, expectedProfileVersion: next.profileVersion, decision: "DECLINED", note: "Fixture-only decline: replacement portrait is not suitable." });
    assert.equal((await db.profile.findUnique({ where: { id: profile.id } })).photoId, replacement.uploadedPhotoAssetId);
    assert.equal((await identities.status(owner.id)).identityVerified, true);
    const third = await upload();
    const thirdProfile = await db.profile.findUnique({ where: { id: profile.id } });
    await reviews.cancel(owner.id, third.photoReview.pending.id, { expectedVersion: 1, expectedProfileVersion: thirdProfile.version });
    await db.person.update({ where: { id: owner.personId }, data: { firstName: "Changed" } });
    await db.person.update({ where: { id: owner.personId }, data: { firstName: "Photo" } });
    assert.equal((await identities.status(owner.id)).identityVerified, false);
  } finally {
    const ids = accounts.map((a) => a.id), people = accounts.map((a) => a.personId);
    try {
      await db.profilePhotoReviewAudit.deleteMany({ where: { review: { accountId: { in: ids } } } });
      await db.profile.updateMany({ where: { personId: { in: people } }, data: { latestPhotoReviewId: null } });
      await db.profilePhotoReview.deleteMany({ where: { accountId: { in: ids } } });
      await db.manualIdentityAudit.deleteMany({ where: { targetAccountId: { in: ids } } });
      await db.manualIdentityEvidence.deleteMany({ where: { accountId: { in: ids } } });
      await db.manualIdentityAttempt.deleteMany({ where: { request: { accountId: { in: ids } } } });
      await db.manualIdentityRequest.deleteMany({ where: { accountId: { in: ids } } });
      await db.manualIdentityReviewer.deleteMany({ where: { accountId: { in: ids } } });
      await db.manualIdentityUploadBudget.deleteMany({ where: { accountId: { in: ids } } });
      await db.session.deleteMany({ where: { accountId: { in: ids } } });
      await db.mfaFactor.deleteMany({ where: { accountId: { in: ids } } });
      await db.profile.updateMany({ where: { personId: { in: people } }, data: { photoId: null } });
      await db.profile.deleteMany({ where: { personId: { in: people } } });
      await db.photoAsset.deleteMany({ where: { personId: { in: people } } });
      await db.account.deleteMany({ where: { id: { in: ids } } });
      await db.person.deleteMany({ where: { id: { in: people } } });
    } finally { await db.$disconnect(); }
  }
});
