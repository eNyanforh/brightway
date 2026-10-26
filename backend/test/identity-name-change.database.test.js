import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../src/modules/auth/password.js";
import { createManualIdentityReviewService } from "../src/modules/manual-identity/manual-identity-review.service.js";
import { createManualIdentityEvidenceService, MANUAL_IDENTITY_CONSENT } from "../src/modules/manual-identity/manual-identity-evidence.service.js";
import { createIdentityNameChangeService, NAME_CHANGE_CONSENT } from "../src/modules/manual-identity/identity-name-change.service.js";
import { createPhotoService } from "../src/modules/photos/photo.service.js";
import { createProfilePhotoReviewService } from "../src/modules/photos/profile-photo-review.service.js";
import { reviewPolicy, MANUAL_REVIEW_CONSENT } from "../src/modules/manual-identity/manual-identity.policy.js";

test("database name corrections serialize proof claims/decisions, roll back failed audits, compose with approved photos and retain exact trust after retention", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  let date = new Date(); const marker = randomUUID(), accounts = [], objects = new Map(), password = "Synthetic name-correction passphrase";
  const hash = await hashPassword(password), now = () => date, policy = reviewPolicy({ MANUAL_IDENTITY_RETENTION_DAYS: "30" });
  const storage = { check() {}, async put(key, bytes) { objects.set(key, bytes); }, async get(key) { return objects.get(key); }, async delete(key) { objects.delete(key); } };
  const identities = createManualIdentityReviewService({ prisma: db, storage, now, policy });
  const uploads = createManualIdentityEvidenceService({ prisma: db, storage, now, processImage: async () => ({ bytes: Buffer.from("synthetic identity image"), width: 640, height: 480 }) });
  const changes = createIdentityNameChangeService({ prisma: db, storage, photoStorage: storage, now, policy });
  try {
    for (const label of ["owner", "reviewer"]) accounts.push(await db.account.create({ data: {
      username: `${label}_${marker.replaceAll("-", "")}`, email: `${label}_${marker}@example.invalid`, passwordHash: hash, emailVerifiedAt: date,
      person: { create: { firstName: "Sample", lastName: label, birthDate: new Date("2000-01-01"), gender: "MALE", phoneNumber: "+231770000000" } },
    } }));
    const [owner, reviewer] = accounts;
    const photo = await db.photoAsset.create({ data: { personId: owner.personId, storageKey: `name-fixture/${marker}`, state: "CLAIMED", expiresAt: new Date(+date + 86400000) } });
    objects.set(photo.storageKey, Buffer.from("synthetic portrait"));
    const profile = await db.profile.create({ data: { personId: owner.personId, version: 1, photoId: photo.id, countryCode: "US", locality: "City", headline: "Developer", careerFieldMode: "EXPLORING", skills: ["JavaScript"], interests: ["Technology"], educationMode: "RECORDS", experienceMode: "RECORDS",
      educationRecords: { create: { institution: "Fixture school", qualification: "Diploma", startMonth: "2018-09", endMonth: "2020-06", current: false, description: "", status: "VERIFIED" } },
      experienceRecords: { create: { organization: "Fixture employer", role: "Developer", type: "EMPLOYMENT", startMonth: "2020-07", endMonth: "2023-06", current: false, description: "", status: "VERIFIED" } },
    } });
    const freshImages = async () => {
      const result = [];
      for (const kind of ["GOVERNMENT_ID", "SELFIE"]) result.push(await uploads.upload(owner.id, kind, Buffer.from("input"), "image/png", MANUAL_IDENTITY_CONSENT));
      return result;
    };
    const initial = await freshImages();
    const identity = await identities.submit(owner.id, { expectedVersion: 0, expectedProfileVersion: 1, idempotencyKey: randomUUID(), governmentId: initial[0].id, selfie: initial[1].id, consentVersion: MANUAL_REVIEW_CONSENT });
    await db.manualIdentityReviewer.create({ data: { accountId: reviewer.id, enabled: true } });
    await db.mfaFactor.create({ data: { accountId: reviewer.id, encryptedSecret: "fixture-only", enabled: true, version: 1, windowStart: date } });
    const session = await db.session.create({ data: { accountId: reviewer.id, tokenHash: randomUUID(), expiresAt: new Date(+date + 100 * 86400000), mfaVersion: 1, mfaVerifiedAt: date } });
    const ownerSession = await db.session.create({ data: { accountId: owner.id, tokenHash: randomUUID(), expiresAt: new Date(+date + 100 * 86400000) } });
    await identities.transition(reviewer.id, session.id, identity.requestId, { expectedVersion: 1 }, true);
    await identities.transition(reviewer.id, session.id, identity.requestId, { expectedVersion: 2, attemptId: identity.attemptId, status: "APPROVED", note: "Synthetic original identity evidence was reviewed." });
    const original = await db.manualIdentityAttempt.findUnique({ where: { id: identity.attemptId } });
    const evidence = await freshImages();
    const data = { expectedProfileVersion: 1, expectedIdentityRevision: 0, idempotencyKey: randomUUID(), password,
      proposedName: { firstName: "Corrected", middleName: "Name", lastName: "Owner" }, reason: "Synthetic correction of a saved spelling error.", governmentId: evidence[0].id, selfie: evidence[1].id, consentVersion: NAME_CHANGE_CONSENT };
    const submissions = await Promise.all([changes.submit(owner.id, ownerSession.id, data), changes.submit(owner.id, ownerSession.id, data)]);
    assert.equal(submissions[0].id, submissions[1].id);
    const id = submissions[0].id;
    assert.equal(await db.identityNameChange.count({ where: { accountId: owner.id } }), 1);
    assert.equal((await db.person.findUnique({ where: { id: owner.personId } })).firstName, "Sample");
    assert.equal((await identities.status(owner.id)).identityVerified, true);
    assert.equal((await changes.detail(reviewer.id, session.id, id)).proposedName, null);
    const assignments = await Promise.allSettled([1, 2].map(() => changes.assign(reviewer.id, session.id, id, { expectedVersion: 1 })));
    assert.equal(assignments.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(assignments.find(r => r.status === "rejected").reason.status, 409);
    assert.deepEqual(await changes.portrait(reviewer.id, session.id, id), Buffer.from("synthetic portrait"));
    const decision = { expectedVersion: 2, expectedProfileVersion: 1, decision: "APPROVED", note: "Synthetic ID and selfie confirm the corrected name." };
    const failing = new Proxy(db, { get(target, property) {
      if (property !== "$transaction") return Reflect.get(target, property);
      return work => target.$transaction(tx => work(new Proxy(tx, { get(inner, key) {
        if (key !== "identityNameChangeAudit") return Reflect.get(inner, key);
        return new Proxy(inner.identityNameChangeAudit, { get(model, method) {
          if (method !== "create") return Reflect.get(model, method);
          return args => { if (args.data.action === "DECIDED") throw Error("Synthetic name audit failure"); return model.create(args); };
        } });
      } })));
    } });
    await assert.rejects(createIdentityNameChangeService({ prisma: failing, storage, now, policy }).decide(reviewer.id, session.id, id, decision), /Synthetic name audit failure/);
    assert.equal((await db.person.findUnique({ where: { id: owner.personId } })).identityRevision, 0);
    assert.equal((await db.account.findUnique({ where: { id: owner.id } })).latestNameChangeId, null);
    assert.equal((await db.profile.findUnique({ where: { id: profile.id } })).version, 1);
    assert.equal((await db.identityNameChange.findUnique({ where: { id } })).state, "IN_REVIEW");
    assert.equal(await db.identityNameChangeAudit.count({ where: { requestId: id, action: "DECIDED" } }), 0);
    const outcomes = await Promise.allSettled([1, 2].map(() => changes.decide(reviewer.id, session.id, id, decision)));
    assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(outcomes.find(r => r.status === "rejected").reason.status, 409);
    const saved = await db.person.findUnique({ where: { id: owner.personId } });
    assert.equal(saved.firstName, "Corrected"); assert.equal(saved.middleName, "Name"); assert.equal(saved.identityRevision, 1);
    assert.equal((await identities.status(owner.id)).identityVerified, true);
    const immutable = await db.manualIdentityAttempt.findUnique({ where: { id: identity.attemptId } });
    assert.deepEqual(immutable.snapshot, original.snapshot); assert.equal(immutable.identityHash, original.identityHash);
    // An approved photo after the corrected name must compose with its exact proof.
    const photos = createPhotoService({ prisma: db, storage, now, process: async () => ({ bytes: Buffer.from("photo fixture"), width: 256, height: 256 }) });
    const photoReviews = createProfilePhotoReviewService({ prisma: db, storage, now });
    const replacement = await photos.uploadOwner(owner.personId, 2, Buffer.from("input"), "image/png");
    await photoReviews.assign(reviewer.id, session.id, replacement.photoReview.pending.id, { expectedVersion: 1 });
    await photoReviews.decide(reviewer.id, session.id, replacement.photoReview.pending.id, { expectedVersion: 2, expectedProfileVersion: 3, decision: "APPROVED", note: "Synthetic corrected-name portrait review completed." });
    assert.equal((await identities.status(owner.id)).identityVerified, true);
    // Revoke an assigned reviewer's access to the correction's retained evidence.
    await db.manualIdentityReviewer.update({ where: { accountId: reviewer.id }, data: { enabled: false } });
    await assert.rejects(changes.image(reviewer.id, session.id, id, evidence[0].id), { status: 403 });
    date = new Date(+date + 31 * 86400000); assert.deepEqual(await changes.cleanup(), { purged: 1 });
    const purged = await db.identityNameChange.findUnique({ where: { id } });
    assert.equal(purged.previousName, null); assert.equal(purged.proposedName, null); assert.equal(purged.reason, null); assert.equal(purged.note, null);
    assert.equal((await identities.status(owner.id)).identityVerified, true);
    assert.equal(await db.identityNameChangeAudit.count({ where: { requestId: id, action: "DECIDED" } }), 1);
    await db.person.update({ where: { id: owner.personId }, data: { firstName: "Altered" } });
    await db.person.update({ where: { id: owner.personId }, data: { firstName: "Corrected" } });
    assert.equal((await identities.status(owner.id)).identityVerified, false);
  } finally {
    const ids = accounts.map(a => a.id), people = accounts.map(a => a.personId);
    try {
      await db.account.updateMany({ where: { id: { in: ids } }, data: { latestNameChangeId: null } });
      await db.identityNameChangeAudit.deleteMany({ where: { request: { accountId: { in: ids } } } });
      await db.manualIdentityEvidence.deleteMany({ where: { accountId: { in: ids } } });
      await db.identityNameChange.deleteMany({ where: { accountId: { in: ids } } });
      await db.profilePhotoReviewAudit.deleteMany({ where: { review: { accountId: { in: ids } } } });
      await db.profile.updateMany({ where: { personId: { in: people } }, data: { latestPhotoReviewId: null } });
      await db.profilePhotoReview.deleteMany({ where: { accountId: { in: ids } } });
      await db.manualIdentityAudit.deleteMany({ where: { targetAccountId: { in: ids } } });
      await db.manualIdentityAttempt.deleteMany({ where: { request: { accountId: { in: ids } } } });
      await db.manualIdentityRequest.deleteMany({ where: { accountId: { in: ids } } });
      await db.manualIdentityReviewer.deleteMany({ where: { accountId: { in: ids } } });
      await db.manualIdentityUploadBudget.deleteMany({ where: { accountId: { in: ids } } });
      await db.session.deleteMany({ where: { accountId: { in: ids } } }); await db.mfaFactor.deleteMany({ where: { accountId: { in: ids } } });
      await db.profile.deleteMany({ where: { personId: { in: people } } }); await db.photoAsset.deleteMany({ where: { personId: { in: people } } });
      await db.account.deleteMany({ where: { id: { in: ids } } }); await db.person.deleteMany({ where: { id: { in: people } } });
    } finally { await db.$disconnect(); }
  }
});
