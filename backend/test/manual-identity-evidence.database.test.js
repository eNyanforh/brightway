import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createManualIdentityEvidenceService, MANUAL_IDENTITY_CONSENT as CONSENT } from "../src/modules/manual-identity/manual-identity-evidence.service.js";

test("database manual identity evidence enforces eligibility, owner isolation and concurrent upload budgets", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const marker = randomUUID(), objects = new Map(), created = [];
  let date = new Date(), photo;
  const storage = { check() {}, async put(key, bytes) { objects.set(key, bytes); }, async get(key) { return objects.get(key); }, async delete(key) { objects.delete(key); } };
  const config = { prisma: db, storage, now: () => date, processImage: async () => ({ bytes: Buffer.from("sanitized image"), width: 640, height: 480 }) };
  const service = createManualIdentityEvidenceService(config);
  const put = (s, accountId) => s.upload(accountId, "GOVERNMENT_ID", Buffer.from("input"), "image/png", CONSENT);
  try {
    for (const suffix of ["owner", "other"]) {
      created.push(await db.account.create({ data: { username: `manual_${suffix}_${marker}`, email: `${suffix}_${marker}@example.invalid`, passwordHash: "not-a-usable-hash", emailVerifiedAt: date,
        person: { create: { firstName: "Manual test", lastName: suffix, phoneNumber: "+231770000000" } } } }));
    }
    const [owner, other] = created;
    await assert.rejects(put(service, owner.id), { status: 403 });
    assert.equal(await db.manualIdentityEvidence.count({ where: { accountId: owner.id } }), 0);
    photo = await db.photoAsset.create({ data: { personId: owner.personId, storageKey: `test-photo-${marker}`, state: "CLAIMED", expiresAt: new Date(+date + 86400000) } });
    const profile = await db.profile.create({ data: { personId: owner.personId, countryCode: "US", locality: "City", headline: "Developer", careerFieldMode: "EXPLORING", skills: ["JavaScript"], interests: ["Technology"], photoId: photo.id,
      educationMode: "RECORDS", experienceMode: "RECORDS",
      educationRecords: { create: { institution: "Test school", qualification: "Diploma", startMonth: "2018-09", endMonth: "2020-06", current: false, description: "", status: "VERIFIED" } },
      experienceRecords: { create: { organization: "Test employer", role: "Developer", type: "EMPLOYMENT", startMonth: "2020-07", endMonth: "2023-06", current: false, description: "", status: "VERIFIED" } },
    } });
    const one = await put(service, owner.id);
    assert.equal(one.state, "READY"); assert.equal(Object.hasOwn(one, "identityVerified"), false);
    await assert.rejects(service.read(other.id, one.id), { status: 404 });
    await assert.rejects(service.remove(other.id, one.id), { status: 404 });
    assert.equal((await service.read(owner.id, one.id)).bytes.toString(), "sanitized image");
    // Separate service instances exercise the database lock, not an in-process queue.
    await db.manualIdentityUploadBudget.update({ where: { accountId: owner.id }, data: { count: 19 } });
    const raced = await Promise.allSettled([put(service, owner.id), put(createManualIdentityEvidenceService(config), owner.id)]);
    assert.equal(raced.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(raced.find((r) => r.status === "rejected").reason.status, 429);
    assert.equal((await db.manualIdentityUploadBudget.findUnique({ where: { accountId: owner.id } })).count, 20);
    await db.educationRecord.updateMany({ where: { profileId: profile.id }, data: { status: "ACTION_REQUIRED" } });
    await assert.rejects(put(service, owner.id), { status: 403 });
    await service.remove(owner.id, one.id);
    await assert.rejects(service.read(owner.id, one.id), { status: 404 });
    date = new Date(+date + 26 * 3600000);
    const cleaned = await service.cleanup();
    assert.equal(cleaned.deleted, 2); assert.equal(cleaned.failed, 0); assert.equal(objects.size, 0);
  } finally {
    const ids = created.map((a) => a.id), people = created.map((a) => a.personId);
    await db.manualIdentityEvidence.deleteMany({ where: { accountId: { in: ids } } });
    await db.manualIdentityUploadBudget.deleteMany({ where: { accountId: { in: ids } } });
    await db.profile.deleteMany({ where: { personId: { in: people } } });
    if (photo) await db.photoAsset.delete({ where: { id: photo.id } });
    await db.account.deleteMany({ where: { id: { in: ids } } });
    await db.person.deleteMany({ where: { id: { in: people } } });
    await db.$disconnect();
  }
});
