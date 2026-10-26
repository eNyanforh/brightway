import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateTestDatabase } from "./check-database.js";
import { createManualIdentityEvidenceService, MANUAL_IDENTITY_CONSENT } from "../src/modules/manual-identity/manual-identity-evidence.service.js";
import { createManualIdentityReviewService } from "../src/modules/manual-identity/manual-identity-review.service.js";
import { reviewPolicy, MANUAL_REVIEW_CONSENT } from "../src/modules/manual-identity/manual-identity.policy.js";
const DAY = 86400000;

// Restrict the production cleanup services' candidate sweeps, including transaction clients.
// Other queries inside those services address the exact candidates/requests selected here.
export function scopeRetentionPrisma(db, ownerId, attemptId) {
  return new Proxy(db, { get(target, key) {
    if (key === "$transaction") return work => target.$transaction(tx => work(scopeRetentionPrisma(tx, ownerId, attemptId)));
    if (["manualIdentityAttempt", "manualIdentityEvidence"].includes(key)) {
      return new Proxy(target[key], { get(delegate, method) {
        if (method === "findMany") return (args = {}) => delegate.findMany({ ...args,
          where: { AND: [args.where ?? {}, key === "manualIdentityAttempt" ? { id: attemptId } : { accountId: ownerId }] } });
        const value = delegate[method]; return typeof value === "function" ? value.bind(delegate) : value;
      } });
    }
    const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
  } });
}

// Never list a bucket or accept an arbitrary storage key. Even ambiguous puts stay tracked.
export function retentionStorage(storage, head, runId) {
  assert.match(runId, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
  const keys = new Map();
  const known = key => { assert(keys.has(key), "Refusing access to an object outside this test run."); return keys.get(key); };
  return {
    keys,
    check: () => storage.check(),
    async put(key, bytes, type) {
      assert(!keys.has(key), "Duplicate fixture object key.");
      assert.match(key, /^manual-identity\/[a-f0-9-]{36}\.webp$/i, "Only newly generated service fixture keys are allowed.");
      const owned = key; // Keep durable DB storageKey equal to the real object key, including on failure.
      assert.equal(await head(owned), false, "Synthetic key already exists; refusing overwrite.");
      keys.set(key, owned);
      await storage.put(owned, bytes, type);
    },
    get: (key, options) => storage.get(known(key), options),
    delete: key => storage.delete(known(key)),
    async exists(key) { return head(known(key)); },
    async dispose() {
      let failed = 0;
      for (const key of keys.values()) {
        try { await storage.delete(key); assert.equal(await head(key), false); }
        catch { failed++; }
      }
      return failed;
    },
  };
}

export async function checkIdentityRetention({ env, prisma: db, storage, head, makeImage, runId = randomUUID(), log = () => {} }) {
  validateTestDatabase(env); // Fail before any DB query or storage call; never accept the application URL.
  const owned = retentionStorage(storage, head, runId);
  owned.check();
  let date = new Date(), photo, requestId, attemptId, primaryFailure;
  const accounts = [];
  const now = () => date;
  const policy = reviewPolicy({ MANUAL_IDENTITY_RETENTION_DAYS: "30" });
  const reviews = createManualIdentityReviewService({ prisma: db, storage: owned, now, policy });
  const uploads = createManualIdentityEvidenceService({ prisma: db, storage: owned, now });
  let result, stage = "generating the synthetic image";
  try {
    const image = await makeImage();
    assert(Buffer.isBuffer(image) && image.length > 0 && image.length < 1024 * 1024);
    stage = "creating isolated fixture accounts and profile";
    for (const label of ["o", "r"]) accounts.push(await db.account.create({ data: {
      username: `ret_${label}_${runId.replaceAll("-", "").slice(0, 20)}`, email: `ret_${label}_${runId}@example.invalid`,
      passwordHash: "synthetic-unusable-password-hash", emailVerifiedAt: date,
      person: { create: { firstName: "Synthetic", lastName: "Retention fixture", birthDate: new Date("2000-01-01"), gender: "MALE", phoneNumber: "+231770000000" } },
    } }));
    const [owner, reviewer] = accounts;
    // A DB-only profile-photo fixture satisfies eligibility; no profile bucket is accessed.
    photo = await db.photoAsset.create({ data: { personId: owner.personId, storageKey: `retention-fixture-${runId}`, state: "CLAIMED", expiresAt: new Date(+date + DAY) } });
    const profile = await db.profile.create({ data: {
      personId: owner.personId, version: 1, photoId: photo.id, countryCode: "US", locality: "Test city", headline: "Synthetic fixture", careerFieldMode: "EXPLORING", skills: ["JavaScript"], interests: ["Technology"],
      educationMode: "RECORDS", experienceMode: "RECORDS",
      educationRecords: { create: { institution: "Synthetic school", qualification: "Fixture diploma", startMonth: "2018-09", endMonth: "2020-06", current: false, description: "", status: "VERIFIED" } },
      experienceRecords: { create: { organization: "Synthetic employer", role: "Fixture role", type: "EMPLOYMENT", startMonth: "2020-07", endMonth: "2023-06", current: false, description: "", status: "VERIFIED" } },
    } });
    stage = "uploading and attaching synthetic evidence";
    const images = [];
    for (const kind of ["GOVERNMENT_ID", "SELFIE"]) images.push(await uploads.upload(owner.id, kind, image, "image/png", MANUAL_IDENTITY_CONSENT));
    const submitted = await reviews.submit(owner.id, { expectedVersion: 0, expectedProfileVersion: profile.version,
      governmentId: images[0].id, selfie: images[1].id, idempotencyKey: randomUUID(), consentVersion: MANUAL_REVIEW_CONSENT });
    requestId = submitted.requestId; attemptId = submitted.attemptId;
    stage = "assigning and approving the synthetic request";
    await db.manualIdentityReviewer.create({ data: { accountId: reviewer.id, enabled: true } });
    await db.mfaFactor.create({ data: { accountId: reviewer.id, encryptedSecret: "synthetic-fixture-no-usable-secret", enabled: true, version: 1, windowStart: date } });
    const session = await db.session.create({ data: { accountId: reviewer.id, tokenHash: randomUUID(), expiresAt: new Date(+date + DAY), mfaVersion: 1, mfaVerifiedAt: date } });
    let request = await db.manualIdentityRequest.findUnique({ where: { id: requestId } });
    await reviews.transition(reviewer.id, session.id, requestId, { expectedVersion: request.version }, true);
    request = await db.manualIdentityRequest.findUnique({ where: { id: requestId } });
    await reviews.transition(reviewer.id, session.id, requestId, { expectedVersion: request.version, attemptId, status: "APPROVED", note: "Synthetic fixture approval to exercise retention; no human identity asserted." });
    assert.equal((await reviews.status(owner.id)).identityVerified, true);
    stage = "checking attached objects and private readback";
    const rows = await db.manualIdentityEvidence.findMany({ where: { accountId: owner.id } });
    assert.equal(rows.length, 2); assert(rows.every(row => row.state === "ATTACHED"));
    for (const row of rows) {
      assert.equal(await owned.exists(row.storageKey), true);
      assert.deepEqual((await reviews.download(owner.id, undefined, row.id)).bytes, await owned.get(row.storageKey));
    }
    log("PASS: two synthetic images uploaded, attached through review services and privately read back.");
    stage = "checking the retention boundary and snapshot purge";
    const scoped = scopeRetentionPrisma(db, owner.id, attemptId);
    const cleanupReviews = createManualIdentityReviewService({ prisma: scoped, storage: owned, now, policy });
    assert.deepEqual(await cleanupReviews.cleanup(), { purged: 0 });
    const approved = await db.manualIdentityAttempt.findUnique({ where: { id: attemptId } });
    date = new Date(approved.purgeAt); // Injected into this test's services only; no process/app clock changes.
    await assert.rejects(reviews.download(owner.id, undefined, rows[0].id), { status: 404 });
    assert.equal((await reviews.owner(owner.id)).attempts[0].note, null);
    assert.deepEqual(await cleanupReviews.cleanup(), { purged: 1 });
    const purged = await db.manualIdentityAttempt.findUnique({ where: { id: attemptId } });
    assert.equal(purged.snapshot, null); assert.equal(purged.note, null); assert(purged.purgedAt);
    assert.equal(await db.manualIdentityAudit.count({ where: { requestId, action: "DECIDED" } }), 1);
    assert.equal((await reviews.status(owner.id)).identityVerified, true);
    // Align only newly created fixture rows with the injected clock (@updatedAt uses wall time).
    await db.manualIdentityEvidence.updateMany({ where: { accountId: owner.id, state: "DELETE_PENDING" }, data: { updatedAt: date } });
    stage = "checking deletion grace and retry";
    let injectFailure = true;
    const retryStorage = { ...owned, async delete(key) {
      if (injectFailure) { injectFailure = false; throw Error("Injected retry test before the R2 call."); }
      return owned.delete(key);
    } };
    const files = createManualIdentityEvidenceService({ prisma: scoped, storage: retryStorage, now });
    assert.deepEqual(await files.cleanup(), { deleted: 0, failed: 0 });
    date = new Date(+date + 11 * 60000);
    assert.deepEqual(await files.cleanup(), { deleted: 1, failed: 1 });
    const pending = await db.manualIdentityEvidence.findMany({ where: { accountId: owner.id, state: "DELETE_PENDING" } });
    assert.equal(pending.length, 1); assert.equal(await owned.exists(pending[0].storageKey), true);
    await db.manualIdentityEvidence.updateMany({ where: { accountId: owner.id, state: "DELETE_PENDING" }, data: { updatedAt: date } });
    assert.deepEqual(await files.cleanup(), { deleted: 0, failed: 0 });
    date = new Date(+date + 11 * 60000);
    assert.deepEqual(await files.cleanup(), { deleted: 1, failed: 0 });
    for (const row of rows) assert.equal(await owned.exists(row.storageKey), false);
    assert.equal(await db.manualIdentityEvidence.count({ where: { accountId: owner.id, state: "DELETED" } }), 2);
    assert.equal((await reviews.status(owner.id)).identityVerified, true);
    assert.deepEqual(await cleanupReviews.cleanup(), { purged: 0 });
    assert.deepEqual(await files.cleanup(), { deleted: 0, failed: 0 });
    log("PASS: exact-deadline privacy, payload purge, deletion grace, injected failure/retry and authenticated object absence; valid trust preserved.");
    result = { attached: 2, snapshotsPurged: 1, objectsDeleted: 2, deletionConfirmed: true, retryVerified: true, identityPreserved: true };
  } catch (error) { primaryFailure = error; }
  // Clean only generated objects, then only rows belonging to accounts this invocation created.
  // Retain DB ownership records if a storage cleanup cannot be confirmed, so operators can retry.
  const failures = await owned.dispose();
  if (failures) throw Error(`Synthetic storage cleanup could not be confirmed. Keep fixture records for run ${runId}; do not run an unscoped bucket cleanup.`);
  try {
    const ids = accounts.map(a => a.id), people = accounts.map(a => a.personId);
    if (ids.length) {
      const requests = await db.manualIdentityRequest.findMany({ where: { accountId: { in: ids } }, select: { id: true } });
      await db.manualIdentityEvidence.deleteMany({ where: { accountId: { in: ids } } });
      await db.manualIdentityAudit.deleteMany({ where: { targetAccountId: { in: ids } } });
      await db.manualIdentityAttempt.deleteMany({ where: { requestId: { in: requests.map(r => r.id) } } });
      await db.manualIdentityRequest.deleteMany({ where: { accountId: { in: ids } } });
      await db.manualIdentityUploadBudget.deleteMany({ where: { accountId: { in: ids } } });
      await db.manualIdentityReviewer.deleteMany({ where: { accountId: { in: ids } } });
      await db.session.deleteMany({ where: { accountId: { in: ids } } });
      await db.mfaFactor.deleteMany({ where: { accountId: { in: ids } } });
      await db.profile.deleteMany({ where: { personId: { in: people } } });
      if (photo) await db.photoAsset.deleteMany({ where: { id: photo.id } });
      await db.account.deleteMany({ where: { id: { in: ids } } });
      await db.person.deleteMany({ where: { id: { in: people } } });
    }
  } catch { throw Error(`Synthetic database cleanup failed for run ${runId}. Objects were removed; inspect only this run's fixture rows.`); }
  if (primaryFailure) throw Error(`Retention acceptance failed while ${stage}; generated fixture objects and rows were cleaned. Check migrations, connectivity and private storage.`);
  return result;
}

async function main() {
  if (process.argv.slice(2).join(" ") !== "--run") throw Error("Usage: node backend/scripts/check-identity-retention.js --run");
  const { config: loadEnv } = await import("dotenv");
  loadEnv({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
  const url = validateTestDatabase(process.env);
  const jurisdiction = process.env.R2_JURISDICTION || "default";
  if (!/^[a-f0-9]{32}$/i.test(process.env.R2_ACCOUNT_ID ?? "") || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !["default", "eu", "us", "fedramp"].includes(jurisdiction)) throw Error("Check the existing private identity R2 configuration.");
  const { S3Client, HeadObjectCommand } = await import("@aws-sdk/client-s3");
  const { createManualIdentityStorage } = await import("../src/modules/manual-identity/manual-identity.storage.js");
  const { PrismaClient } = await import("@prisma/client"), { PrismaPg } = await import("@prisma/adapter-pg");
  const { default: sharp } = await import("sharp");
  const client = new S3Client({ region: "auto", maxAttempts: 2,
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.${jurisdiction === "default" ? "" : `${jurisdiction}.`}r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), transactionOptions: { maxWait: 10000, timeout: 15000 } });
  const storage = createManualIdentityStorage({ client });
  console.log("Using isolated TEST_DATABASE_URL and generated run-owned R2 keys. Application database and existing reviews are excluded. No servers are required.");
  try {
    const result = await checkIdentityRetention({ env: process.env, prisma: db, storage, log: console.log,
      makeImage: () => sharp({ create: { width: 640, height: 480, channels: 3, background: "#eaf2ff" } }).png().toBuffer(),
      async head(Key) {
        try { await client.send(new HeadObjectCommand({ Bucket: process.env.R2_IDENTITY_BUCKET.trim(), Key }), { abortSignal: AbortSignal.timeout(30000) }); return true; }
        catch (error) { if (error?.$metadata?.httpStatusCode === 404) return false; throw Error("Unable to confirm synthetic object existence."); }
      },
    });
    console.log(`PASS: ${JSON.stringify(result)}`);
  } finally { await db.$disconnect(); client.destroy(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
