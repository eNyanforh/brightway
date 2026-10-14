import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPhotoService, draftHash } from "../src/modules/photos/photo.service.js";

test("database photo claims roll back on duplicate identity and a draft creates at most one account", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const token = randomUUID().replaceAll("-", "").repeat(2);
  const marker = randomUUID();
  const draft = await prisma.signupDraft.create({ data: { tokenHash: draftHash(token), expiresAt: new Date(Date.now() + 60000) } });
  const assets = await Promise.all([0, 1].map(() => prisma.photoAsset.create({ data: {
    storageKey: `test-only/${randomUUID()}`, draftId: draft.id, state: "READY", expiresAt: new Date(Date.now() + 60000),
  } })));
  const photos = createPhotoService({ prisma, storage: {} });
  const create = (index) => (tx) => tx.account.create({ data: {
    username: `photo_${marker.replaceAll("-", "").slice(0, 16)}_${index}`,
    email: `${marker}-${index}@example.com`, passwordHash: "test-only-not-login-capable",
    person: { create: { firstName: marker, lastName: "PhotoTest" } },
  }, select: { id: true, person: { select: { id: true } } } });
  try {
    await assert.rejects(photos.registerAsset(assets[0].id, token, async () => { throw Object.assign(new Error("duplicate"), { code: "P2002" }); }));
    assert.equal((await prisma.photoAsset.findUnique({ where: { id: assets[0].id } })).state, "READY");
    const result = await Promise.allSettled(assets.map((asset, index) => photos.registerAsset(asset.id, token, create(index))));
    assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await prisma.account.count({ where: { person: { firstName: marker } } }), 1);
    assert.equal(await prisma.profile.count({ where: { person: { firstName: marker } } }), 1);
    assert.equal(await prisma.photoAsset.count({ where: { draftId: draft.id, state: "CLAIMED" } }), 1);
  } finally {
    await prisma.profile.deleteMany({ where: { person: { firstName: marker } } });
    await prisma.photoAsset.deleteMany({ where: { draftId: draft.id } });
    await prisma.signupDraft.delete({ where: { id: draft.id } });
    await prisma.account.deleteMany({ where: { person: { firstName: marker } } });
    await prisma.person.deleteMany({ where: { firstName: marker } });
    await prisma.$disconnect();
  }
});