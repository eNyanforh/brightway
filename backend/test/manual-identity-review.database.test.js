import { hashPassword } from "../src/modules/auth/password.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createManualIdentityEvidenceService, MANUAL_IDENTITY_CONSENT } from "../src/modules/manual-identity/manual-identity-evidence.service.js";
import { createManualIdentityReviewService } from "../src/modules/manual-identity/manual-identity-review.service.js";
import { reviewPolicy, MANUAL_REVIEW_CONSENT, submitIdentitySchema } from "../src/modules/manual-identity/manual-identity.policy.js";

test("database manual identity requests serialize retries and decisions, revoke stale trust and retain private audit on purge", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  let date = new Date(), photo;
  const ownerPassword = "fixture-only legacy completion password";
  const passwordHash = await hashPassword(ownerPassword);
  const accounts = [], marker = randomUUID(), objects = new Map();
  const storage = { check() {}, async put(key, bytes) { objects.set(key, bytes); }, async get(key) { return objects.get(key); }, async delete(key) { objects.delete(key); } };
  const config = { prisma: db, storage, now: () => date, policy: reviewPolicy({ MANUAL_IDENTITY_RETENTION_DAYS: "30" }) };
  const reviews = createManualIdentityReviewService(config);
  const uploads = createManualIdentityEvidenceService({ ...config, processImage: async () => ({ bytes: Buffer.from("test image"), width: 640, height: 480 }) });
  try {
    for (const label of ["owner", "reviewer"]) accounts.push(await db.account.create({ data: {
      username: `${label}_${marker.replaceAll("-", "")}`, email: `${label}_${marker}@example.invalid`, passwordHash, emailVerifiedAt: date,
      person: { create: { firstName: "Sample", lastName: label, birthDate: label === "owner" ? null : new Date("2000-01-01"), gender: "MALE", phoneNumber: "+231770000000" } },
    } }));
    const [owner, reviewer] = accounts;
    photo = await db.photoAsset.create({ data: { personId: owner.personId, storageKey: `test-photo-${marker}`, state: "CLAIMED", expiresAt: new Date(+date + 86400000) } });
    const profile = await db.profile.create({ data: {
      version: 1, personId: owner.personId, photoId: photo.id, countryCode: "US", locality: "City", headline: "Developer", careerFieldMode: "EXPLORING", skills: ["JavaScript"], interests: ["Technology"],
      educationMode: "RECORDS", experienceMode: "RECORDS",
      educationRecords: { create: { institution: "Fixture school", qualification: "Diploma", startMonth: "2018-09", endMonth: "2020-06", current: false, description: "", status: "VERIFIED" } },
      experienceRecords: { create: { organization: "Fixture employer", role: "Developer", type: "EMPLOYMENT", startMonth: "2020-07", endMonth: "2023-06", current: false, description: "", status: "VERIFIED" } },
    } });
    assert.equal(profile.version, 1, "The complete-profile fixture must represent a saved profile revision.");
    const legacy = await reviews.owner(owner.id);
    assert.equal(legacy.eligibility.requirementsMet, true); assert.equal(legacy.identityDetailsComplete, false);
    assert.deepEqual(legacy.missingIdentityFields, ["birthDate"]); assert.equal(legacy.canSubmit, false);
    const ownerSession = await db.session.create({ data: { accountId: owner.id, tokenHash: randomUUID(), expiresAt: new Date(+date + 7 * 86400000) } });
    await reviews.completeDetails(owner.id, ownerSession.id, { expectedIdentityRevision: 0, password: ownerPassword, changes: { birthDate: "2000-01-01" } });
    assert.equal((await reviews.owner(owner.id)).canSubmit, true);
    assert.equal((await db.person.findUnique({ where: { id: owner.personId } })).identityRevision, 1);
    assert.equal((await db.profile.findUnique({ where: { id: profile.id } })).version, profile.version);
    assert.equal(await db.manualIdentityAudit.count({ where: { targetAccountId: owner.id, action: "MISSING_IDENTITY_DETAILS_COMPLETED" } }), 1);
    await assert.rejects(reviews.completeDetails(owner.id, ownerSession.id, { expectedIdentityRevision: 1, password: ownerPassword, changes: { birthDate: "2001-01-01" } }), { status: 409 });
    async function submission() {
      const images = [];
      for (const kind of ["GOVERNMENT_ID", "SELFIE"]) images.push(await uploads.upload(owner.id, kind, Buffer.from("input"), "image/png", MANUAL_IDENTITY_CONSENT));
      const state = await reviews.owner(owner.id);
      return submitIdentitySchema.parse({ expectedVersion: state.request?.version ?? 0, expectedProfileVersion: (await db.profile.findUnique({ where: { id: profile.id } })).version,
        governmentId: images[0].id, selfie: images[1].id, idempotencyKey: randomUUID(), consentVersion: MANUAL_REVIEW_CONSENT });
    }
    const data = await submission();
    const replay = await Promise.all([reviews.submit(owner.id, data), reviews.submit(owner.id, data)]);
    assert.equal(replay[0].attemptId, replay[1].attemptId);
    assert.equal(await db.manualIdentityRequest.count({ where: { accountId: owner.id } }), 1);
    const requestId = replay[0].requestId;
    assert.equal(await db.manualIdentityAttempt.count({ where: { requestId } }), 1);
    assert.equal(await db.manualIdentityEvidence.count({ where: { attemptId: replay[0].attemptId, state: "ATTACHED" } }), 2);
    await assert.rejects(reviews.access(reviewer.id, randomUUID()), { status: 403 });
    await db.manualIdentityReviewer.create({ data: { accountId: reviewer.id, enabled: true } });
    await db.mfaFactor.create({ data: { accountId: reviewer.id, encryptedSecret: "test-only-not-a-secret", enabled: true, version: 1, windowStart: date } });
    const session = await db.session.create({ data: { accountId: reviewer.id, tokenHash: randomUUID(), expiresAt: new Date(+date + 7 * 86400000), mfaVersion: 1, mfaVerifiedAt: date } });
    const request = await db.manualIdentityRequest.findUnique({ where: { id: requestId } });
    const assigned = await Promise.allSettled([1, 2].map(() => reviews.transition(reviewer.id, session.id, requestId, { expectedVersion: request.version }, true)));
    assert.equal(assigned.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(assigned.find((r) => r.status === "rejected").reason.status, 409);
    const current = await db.manualIdentityRequest.findUnique({ where: { id: requestId } });
    const decision = { expectedVersion: current.version, attemptId: current.currentAttemptId, status: "APPROVED", note: "Test-only review of the fixture ID and selfie snapshot." };
    const decisions = await Promise.allSettled([1, 2].map(() => reviews.transition(reviewer.id, session.id, requestId, decision)));
    assert.equal(decisions.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(decisions.find((r) => r.status === "rejected").reason.status, 409);
    assert.equal(await db.manualIdentityAudit.count({ where: { requestId, action: "DECIDED" } }), 1);
    assert.equal((await reviews.status(owner.id)).identityVerified, true);
    await db.profile.update({ where: { id: profile.id }, data: { headline: "Updated headline", version: { increment: 1 } } });
    assert.equal((await reviews.status(owner.id)).identityVerified, true);
    // Actual PostgreSQL triggers, rather than simulated hashes, protect change-and-revert.
    await db.person.update({ where: { id: owner.personId }, data: { firstName: "Changed" } });
    await db.person.update({ where: { id: owner.personId }, data: { firstName: "Sample" } });
    assert.equal((await db.person.findUnique({ where: { id: owner.personId } })).identityRevision, 3);
    assert.equal((await reviews.status(owner.id)).identityVerified, false);
    await reviews.submit(owner.id, await submission());
    assert.equal(await db.manualIdentityAttempt.count({ where: { requestId } }), 2);
    await db.manualIdentityReviewer.update({ where: { accountId: reviewer.id }, data: { enabled: false } });
    await assert.rejects(reviews.detail(reviewer.id, session.id, requestId), { status: 403 });
    date = new Date(+date + 31 * 86400000);
    await reviews.cleanup();
    assert.equal((await reviews.owner(owner.id)).status, "EXPIRED");
    assert.equal(await db.manualIdentityEvidence.count({ where: { accountId: owner.id, state: "ATTACHED" } }), 0);
    const attempts = await db.manualIdentityAttempt.findMany({ where: { requestId } });
    assert(attempts.every((row) => row.snapshot === null && row.purgedAt));
    assert.equal(await db.manualIdentityAudit.count({ where: { requestId, action: "DECIDED" } }), 1);
    // Prisma's @updatedAt uses wall-clock time. Align only these synthetic rows
    // with the injected test clock before exercising the deletion grace period.
    await db.manualIdentityEvidence.updateMany({ where: { accountId: owner.id, state: "DELETE_PENDING" }, data: { updatedAt: date } });
    assert.deepEqual(await uploads.cleanup(), { deleted: 0, failed: 0 });
    assert.equal(objects.size, 4);
    date = new Date(+date + 11 * 60000);
    assert.deepEqual(await uploads.cleanup(), { deleted: 4, failed: 0 });
    assert.equal(objects.size, 0);
    assert.equal(await db.manualIdentityEvidence.count({ where: { accountId: owner.id, state: "DELETED" } }), 4);
    assert.deepEqual(await uploads.cleanup(), { deleted: 0, failed: 0 });
    assert.equal(await db.manualIdentityAudit.count({ where: { requestId, action: "DECIDED" } }), 1);
  } finally {
    try {
      const ids = accounts.map((a) => a.id), people = accounts.map((a) => a.personId);
      const requests = await db.manualIdentityRequest.findMany({ where: { accountId: { in: ids } }, select: { id: true } });
      const requestIds = requests.map((r) => r.id);
      await db.manualIdentityEvidence.deleteMany({ where: { accountId: { in: ids } } });
      await db.manualIdentityAudit.deleteMany({ where: { targetAccountId: { in: ids } } });
      await db.manualIdentityAttempt.deleteMany({ where: { requestId: { in: requestIds } } });
      await db.manualIdentityRequest.deleteMany({ where: { id: { in: requestIds } } });
      await db.manualIdentityUploadBudget.deleteMany({ where: { accountId: { in: ids } } });
      await db.manualIdentityReviewer.deleteMany({ where: { accountId: { in: ids } } });
      await db.session.deleteMany({ where: { accountId: { in: ids } } });
      await db.mfaFactor.deleteMany({ where: { accountId: { in: ids } } });
      await db.profile.deleteMany({ where: { personId: { in: people } } });
      if (photo) await db.photoAsset.delete({ where: { id: photo.id } });
      await db.account.deleteMany({ where: { id: { in: ids } } });
      await db.person.deleteMany({ where: { id: { in: people } } });
    } finally { await db.$disconnect(); }
  }
});
