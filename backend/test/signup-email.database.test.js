import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createSignupEmailService } from "../src/modules/auth/signup-email.service.js";
import { createRegistrationService } from "../src/modules/auth/registration.service.js";
import { createPhotoService, draftHash } from "../src/modules/photos/photo.service.js";

test("database email verification commits attempt limits and creates at most one verified account with atomic photo/proof claims", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const marker = randomUUID();
  const email = `${marker}@example.com`;
  const sender = { check() {}, async send() {} };
  const verification = createSignupEmailService({ prisma, sender, secret: "test-only-secret-" + marker, code: () => "123456" });
  const photos = createPhotoService({ prisma, storage: { check() {}, async put() {} },
    process: async () => ({ bytes: Buffer.from("fake-processed-photo"), width: 128, height: 128 }) });
  const register = createRegistrationService({ prisma, photos, verification, hash: async () => "test-password-hash" });
  let draft, badDraft;
  try {
    draft = await photos.begin();
    const asset = await photos.uploadDraft(draft.token, Buffer.from("test-photo"), "image/png");
    const input = { email, firstName: marker, lastName: "EmailTest", username: `email_${marker.replaceAll("-", "").slice(0, 20)}`, password: "long-test-password", photoAssetId: asset.photoAssetId };
    await assert.rejects(register(input, draft.token), { status: 403 });
    assert.equal(await prisma.account.count({ where: { email } }), 0);
    await verification.request(draft.token, email);
    const results = await Promise.allSettled([verification.verify(draft.token, email, "123456"), verification.verify(draft.token, email, "123456")]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    await assert.rejects(register({ ...input, email: `other_${email}` }, draft.token), { status: 403 });
    // A database failure after proof consumption rolls both photo and proof back.
    const broken = createRegistrationService({ prisma, photos, verification, hash: async () => "hash" });
    await assert.rejects(broken({ ...input, username: undefined }, draft.token));
    await verification.requireVerified(draft.token, email);
    assert.equal((await prisma.photoAsset.findUnique({ where: { id: asset.photoAssetId } })).state, "READY");
    const attempts = await Promise.allSettled([register(input, draft.token), register(input, draft.token)]);
    assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
    const account = attempts.find((r) => r.status === "fulfilled").value;
    assert(account.emailVerifiedAt instanceof Date);
    assert.equal(await prisma.account.count({ where: { email } }), 1);
    await assert.rejects(verification.requireVerified(draft.token, email), { status: 403 });
    badDraft = await photos.begin(); await verification.request(badDraft.token, `bad_${email}`);
    await Promise.allSettled(Array.from({ length: 8 }, () => verification.verify(badDraft.token, `bad_${email}`, "999999")));
    assert.equal((await prisma.signupDraft.findUnique({ where: { tokenHash: draftHash(badDraft.token) } })).emailCodeAttempts, 5);
    await assert.rejects(verification.verify(badDraft.token, `bad_${email}`, "123456"), { status: 400 });
  } finally {
    try {
      const owners = await prisma.person.findMany({ where: { firstName: marker }, select: { id: true } });
      const ids = owners.map((row) => row.id);
      await prisma.profile.deleteMany({ where: { personId: { in: ids } } });
      await prisma.account.deleteMany({ where: { personId: { in: ids } } });
      await prisma.photoAsset.deleteMany({ where: { draft: { tokenHash: { in: [draft, badDraft].filter(Boolean).map((row) => draftHash(row.token)) } } } });
      await prisma.person.deleteMany({ where: { id: { in: ids } } });
      await prisma.signupDraft.deleteMany({ where: { tokenHash: { in: [draft, badDraft].filter(Boolean).map((row) => draftHash(row.token)) } } });
      // Bucket IDs are HMACs; expiry cleanup handles this isolated test's delivery counters.
    } finally { await prisma.$disconnect(); }
  }
});