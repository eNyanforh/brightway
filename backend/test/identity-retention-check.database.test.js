import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { checkIdentityRetention } from "../scripts/check-identity-retention.js";

test("guarded retention acceptance runs real SQL with scoped fixture cleanup and synthetic storage", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const objects = new Map(), events = [];
  try {
    const result = await checkIdentityRetention({
      env: { TEST_DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_URL: "postgresql://fixture:unused@unused.invalid/application", DIRECT_URL: "postgresql://fixture:unused@unused.invalid/application" },
      prisma: db, storage: { check() {}, async put(k, bytes) { objects.set(k, bytes); }, async get(k) { return objects.get(k); }, async delete(k) { objects.delete(k); } },
      head: async key => objects.has(key), log: line => events.push(line),
      makeImage: () => sharp({ create: { width: 640, height: 480, channels: 3, background: "#eaf2ff" } }).png().toBuffer(),
    });
    assert.deepEqual(result, { attached: 2, snapshotsPurged: 1, objectsDeleted: 2, deletionConfirmed: true, retryVerified: true, identityPreserved: true });
    assert.equal(objects.size, 0); assert.equal(events.length, 2);
  } finally { await db.$disconnect(); }
});
