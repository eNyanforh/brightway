import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { checkIdentityRetention, retentionStorage, scopeRetentionPrisma } from "../scripts/check-identity-retention.js";
const app = "postgresql://user:password@localhost/brightway_app";

test("retention acceptance refuses an application destination before any database or storage access", async () => {
  const forbidden = new Proxy({}, { get() { throw Error("Unexpected access before destination guard"); } });
  for (const env of [{}, { DATABASE_URL: app, DIRECT_URL: app, TEST_DATABASE_URL: app }]) {
    await assert.rejects(checkIdentityRetention({ env, prisma: forbidden, storage: forbidden }), /TEST_DATABASE_URL/);
  }
});

test("retention sweeps constrain both outer and transaction clients to the run's fixture IDs", async () => {
  const calls = [], db = { manualIdentityAttempt: { async findMany(args) { calls.push(args); return []; } }, manualIdentityEvidence: { async findMany(args) { calls.push(args); return []; } } };
  db.$transaction = async work => work(db);
  const scoped = scopeRetentionPrisma(db, "owner-fixture", "attempt-fixture");
  await scoped.manualIdentityAttempt.findMany({ where: { purgedAt: null }, take: 50 });
  await scoped.$transaction(tx => tx.manualIdentityEvidence.findMany({ where: { state: "DELETE_PENDING" }, take: 100 }));
  assert.deepEqual(calls, [
    { where: { AND: [{ purgedAt: null }, { id: "attempt-fixture" }] }, take: 50 },
    { where: { AND: [{ state: "DELETE_PENDING" }, { accountId: "owner-fixture" }] }, take: 100 },
  ]);
});

test("synthetic storage refuses foreign keys and collisions, tracks ambiguous puts and confirms disposal", async () => {
  const objects = new Map(), deleted = [], key = `manual-identity/${randomUUID()}.webp`;
  const storage = { check() {}, async put(k, value) { objects.set(k, value); throw Error("Ambiguous response"); }, async get(k) { return objects.get(k); }, async delete(k) { deleted.push(k); objects.delete(k); } };
  const owned = retentionStorage(storage, async k => objects.has(k), randomUUID());
  await assert.rejects(owned.put("existing-private-document", Buffer.from("x")), /Only newly generated/);
  assert.throws(() => owned.get(key), /outside this test run/);
  objects.set(key, Buffer.from("existing"));
  await assert.rejects(owned.put(key, Buffer.from("x")), /refusing overwrite/);
  assert.equal(owned.keys.size, 0); objects.clear();
  await assert.rejects(owned.put(key, Buffer.from("synthetic")), /Ambiguous/);
  assert.equal(owned.keys.get(key), key, "Durable storage key must match the actual R2 object key.");
  assert.equal(await owned.dispose(), 0); assert.deepEqual(deleted, [key]); assert.equal(objects.size, 0);
});

test("synthetic storage reports deletion failures instead of claiming cleanup succeeded", async () => {
  let exists = false;
  const owned = retentionStorage({ check() {}, async put() { exists = true; }, async delete() { throw Error("Storage unavailable"); } }, async () => exists, randomUUID());
  await owned.put(`manual-identity/${randomUUID()}.webp`, Buffer.from("synthetic"));
  assert.equal(await owned.dispose(), 1);
});
