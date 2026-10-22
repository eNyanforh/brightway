import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createCredentialService } from "../src/modules/credentials/credential.service.js";
import { createProfileService } from "../src/modules/profile/profile.service.js";

test("database credential races, immutable evidence snapshots, corrections and reviewer revocation remain atomic", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const marker = randomUUID().replaceAll("-", "").slice(0, 16);
  let owner, admin, otherAdmin, profile;
  const storage = { check() {}, async put() {}, async get() { return Buffer.from("test evidence"); }, async delete() {} };
  let time = new Date();
  const credentials = createCredentialService({ prisma, storage, process: async (bytes) => ({ bytes, contentType: "application/pdf" }), now: () => time });
  async function account(suffix, role = "MEMBER") {
    return prisma.account.create({ data: { username: `cred_${marker}_${suffix}`, email: `${marker}_${suffix}@example.com`, passwordHash: "not-a-login-hash", emailVerifiedAt: new Date(), platformRole: role, person: { create: { firstName: marker, lastName: suffix } } }, include: { person: true } });
  }
  const reviewerSessions = new Map();
  async function authenticateReviewer(account) {
    // Domain-test fixture only: actual TOTP enrollment is exercised in mfa.database.test.js.
    await prisma.mfaFactor.upsert({ where: { accountId: account.id },
      create: { accountId: account.id, encryptedSecret: "test-only-domain-fixture", enabled: true, version: 1, windowStart: time }, update: {} });
    const session = await prisma.session.create({ data: { accountId: account.id,
      tokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
      expiresAt: new Date(+time + 3600000), mfaVerifiedAt: time, mfaVersion: 1 } });
    reviewerSessions.set(account.id, session.id);
    return session.id;
  }
  try {
    owner = await account("o"); admin = await account("a", "CREDENTIAL_REVIEWER"); otherAdmin = await account("b", "CREDENTIAL_REVIEWER");
    await authenticateReviewer(admin); await authenticateReviewer(otherAdmin);
    profile = await prisma.profile.create({ data: { personId: owner.personId, educationMode: "RECORDS", educationRecords: { create: { institution: "School", qualification: "Diploma", startMonth: "2020-09", endMonth: "2023-06", current: false, description: "" } } }, include: { educationRecords: true } });
    const record = profile.educationRecords[0];
    const asset = await credentials.upload(owner.personId, "education", record.id, 1, Buffer.from("first document"), "application/pdf");
    const input = { expectedVersion: 0, revision: 1, evidenceIds: [asset.id] };
    const submissions = await Promise.allSettled([credentials.submit(owner.personId, owner.id, "education", record.id, input), credentials.submit(owner.personId, owner.id, "education", record.id, input)]);
    assert.equal(submissions.filter((r) => r.status === "fulfilled").length, 1);
    let review = await prisma.credentialReview.findUnique({ where: { kind_recordId: { kind: "education", recordId: record.id } } });
    assert.equal(await prisma.credentialAttempt.count({ where: { reviewId: review.id } }), 1);
    const initial = review.initialSubmittedAt;
    await assert.rejects(credentials.transition(admin.id, review.id, { expectedVersion: review.version }, true), { status: 403 });
    await assert.rejects(credentials.transition(admin.id, review.id, { expectedVersion: review.version }, true, reviewerSessions.get(otherAdmin.id)), { status: 403 });
    assert.equal((await prisma.credentialReview.findUnique({ where: { id: review.id } })).status, "SUBMITTED");
    assert.equal(await prisma.credentialAuditEvent.count({ where: { reviewId: review.id } }), 1);
    const assigned = await Promise.allSettled([credentials.transition(admin.id, review.id, { expectedVersion: review.version }, true, reviewerSessions.get(admin.id)), credentials.transition(otherAdmin.id, review.id, { expectedVersion: review.version }, true, reviewerSessions.get(otherAdmin.id))]);
    assert.equal(assigned.filter((r) => r.status === "fulfilled").length, 1);
    review = await prisma.credentialReview.findUnique({ where: { id: review.id } });
    const reviewerId = review.reviewerId;
    await credentials.transition(reviewerId, review.id, { expectedVersion: review.version, revision: 1, status: "ACTION_REQUIRED", note: "Upload a clearer institution document." }, false, reviewerSessions.get(reviewerId));
    const profiles = createProfileService({ prisma });
    let saved = await profiles.read(owner.personId);
    const corrected = await profiles.saveHistory(owner.personId, "education", { expectedVersion: saved.version, mode: "RECORDS", records: [{ id: record.id, revision: 1, institution: "Corrected School", qualification: "Diploma", startMonth: "2020-09", endMonth: "2023-06", current: false, description: "" }] });
    assert.equal(corrected.education.records[0].revision, 2);
    await assert.rejects(credentials.submit(owner.personId, owner.id, "education", record.id, { expectedVersion: corrected.version, revision: 2, evidenceIds: [asset.id] }), { status: 400 });
    assert.equal((await profiles.read(owner.personId)).version, corrected.version);
    time = new Date(time.getTime() + 15 * 86400000);
    await authenticateReviewer(admin);
    const replacement = await credentials.upload(owner.personId, "education", record.id, 2, Buffer.from("corrected document"), "application/pdf");
    await credentials.submit(owner.personId, owner.id, "education", record.id, { expectedVersion: corrected.version, revision: 2, evidenceIds: [replacement.id] });
    review = await prisma.credentialReview.findUnique({ where: { id: review.id } });
    assert.equal(review.initialSubmittedAt.getTime(), initial.getTime());
    const attempts = await prisma.credentialAttempt.findMany({ where: { reviewId: review.id }, orderBy: { createdAt: "asc" } });
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].snapshot.institution, "School");
    assert.equal(attempts[1].snapshot.institution, "Corrected School");
    assert.equal((await credentials.owner(owner.personId, "education", record.id)).review.hiddenFromPublic, true);
    await credentials.transition(admin.id, review.id, { expectedVersion: review.version }, true, reviewerSessions.get(admin.id));
    review = await prisma.credentialReview.findUnique({ where: { id: review.id } });
    await prisma.account.update({ where: { id: admin.id }, data: { platformRole: "MEMBER" } });
    saved = await profiles.read(owner.personId);
    await assert.rejects(credentials.transition(admin.id, review.id, { expectedVersion: review.version, revision: 2, status: "VERIFIED", note: "The school confirmed the revised document." }, false, reviewerSessions.get(admin.id)), { status: 403 });
    assert.equal((await profiles.read(owner.personId)).version, saved.version);
    assert.equal((await prisma.educationRecord.findUnique({ where: { id: record.id } })).status, "IN_REVIEW");
    assert.equal(await prisma.credentialAuditEvent.count({ where: { reviewId: review.id } }), 5);
    assert.equal((await profiles.read(owner.personId)).completion.eligibleToRequestVerification, false);
  } finally {
    try {
      const personIds = [owner, admin, otherAdmin].filter(Boolean).map((v) => v.personId);
      if (profile) {
        const reviews = await prisma.credentialReview.findMany({ where: { profileId: profile.id }, select: { id: true } });
        const ids = reviews.map((v) => v.id);
        await prisma.credentialEvidence.deleteMany({ where: { personId: { in: personIds } } });
        await prisma.credentialAuditEvent.deleteMany({ where: { reviewId: { in: ids } } });
        await prisma.credentialAttempt.deleteMany({ where: { reviewId: { in: ids } } });
        await prisma.credentialReview.deleteMany({ where: { id: { in: ids } } });
      }
      await prisma.credentialUploadBudget.deleteMany({ where: { personId: { in: personIds } } });
      await prisma.profile.deleteMany({ where: { personId: { in: personIds } } });
      const accountIds = [owner, admin, otherAdmin].filter(Boolean).map((v) => v.id);
      await prisma.mfaFactor.deleteMany({ where: { accountId: { in: accountIds } } });
      await prisma.account.deleteMany({ where: { personId: { in: personIds } } });
      await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    } finally { await prisma.$disconnect(); }
  }
});
