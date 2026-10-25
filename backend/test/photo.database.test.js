import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createPhotoService,
  draftHash,
  DRAFT_LIFETIME_MS,
} from "../src/modules/photos/photo.service.js";

test("database photo claims roll back on duplicate identity and a draft creates at most one account", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }),
    transactionOptions: { maxWait: 10000, timeout: 15000 },
  });
  const token = randomUUID().replaceAll("-", "").repeat(2);
  const marker = randomUUID();
  const photos = createPhotoService({ prisma, storage: {} });
  let draft;

  function report(label, reason) {
    // Do not print connection strings, adapter metadata or complete Prisma errors.
    console.error(label, {
      name: reason?.name,
      code: reason?.code,
      status: reason?.status,
      ...(reason?.code === "P2028" ? { diagnostic: "Transaction could not start or expired; inspect database latency." } : {}),
    });
  }
  const create = (index) => (tx) => tx.account.create({
    data: {
      username: `photo_${marker.replaceAll("-", "").slice(0, 16)}_${index}`,
      email: `${marker}-${index}@example.invalid`,
      passwordHash: "test-only-not-login-capable",
      person: { create: { firstName: marker, lastName: "PhotoTest" } },
    },
    select: { id: true, person: { select: { id: true } } },
  });

  try {
    // This is a rollback/race test, not an expiry test. Use the normal draft
    // lifetime so remote setup latency does not consume a 60-second fixture.
    const expiresAt = new Date(Date.now() + DRAFT_LIFETIME_MS);
    draft = await prisma.signupDraft.create({
      data: { tokenHash: draftHash(token), expiresAt },
    });
    const assets = await Promise.all([0, 1].map(() => prisma.photoAsset.create({
      data: {
        storageKey: `test-only/${randomUUID()}`,
        draftId: draft.id,
        state: "READY",
        expiresAt,
      },
    })));
    await assert.rejects(
      photos.registerAsset(assets[0].id, token, async () => {
        throw Object.assign(new Error("duplicate"), { code: "P2002" });
      }),
      (error) => {
        if (error.code !== "P2002") report("Unexpected duplicate rollback failure", error);
        return error.code === "P2002";
      },
    );
    assert.equal((await prisma.photoAsset.findUnique({ where: { id: assets[0].id } })).state, "READY");
    assert.equal(+(await prisma.signupDraft.findUnique({ where: { id: draft.id } })).expiresAt, +expiresAt);
    assert.equal(await prisma.account.count({ where: { person: { firstName: marker } } }), 0);
    assert.equal(await prisma.person.count({ where: { firstName: marker } }), 0);

    const results = await Promise.allSettled(assets.map((asset, index) =>
      photos.registerAsset(asset.id, token, create(index))));
    results.forEach((result, index) => {
      if (result.status === "rejected") report(`Photo registration race, request ${index + 1}`, result.reason);
    });
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1,
      "Exactly one registration must succeed; inspect rejection diagnostics if neither succeeded.");
    const loser = results.find((r) => r.status === "rejected");
    assert(loser, "The other registration must be rejected.");
    assert([400, 401].includes(loser.reason?.status),
      "The loser must be rejected because the draft was consumed, not because of a database failure.");
    assert.equal(await prisma.account.count({ where: { person: { firstName: marker } } }), 1);
    assert.equal(await prisma.person.count({ where: { firstName: marker } }), 1);
    assert.equal(await prisma.profile.count({ where: { person: { firstName: marker } } }), 1);
    assert.equal(await prisma.photoAsset.count({ where: { draftId: draft.id, state: "CLAIMED" } }), 1);
    assert.equal(await prisma.photoAsset.count({ where: { draftId: draft.id, state: "READY" } }), 1);
  } finally {
    try {
      await prisma.profile.deleteMany({ where: { person: { firstName: marker } } });
      if (draft) {
        await prisma.photoAsset.deleteMany({ where: { draftId: draft.id } });
        await prisma.signupDraft.delete({ where: { id: draft.id } });
      }
      await prisma.account.deleteMany({ where: { person: { firstName: marker } } });
      await prisma.person.deleteMany({ where: { firstName: marker } });
    } finally {
      await prisma.$disconnect();
    }
  }
});
