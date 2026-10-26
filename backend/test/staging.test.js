import test from "node:test";
import assert from "node:assert/strict";
import { validateStagingEnvironment } from "../scripts/check-staging-env.js";
import { runLockedCleanup, runIdentityCleanup } from "../src/jobs/identity-cleanup.js";
import { manualReviewFixture } from "../test-support/manual-identity-review-fixture.js";
function configured() { return {
  NODE_ENV: "production", BRIGHTWAY_STAGE: "private-staging", STAGING_DATABASE_ACK: "isolated-staging-database",
  CLIENT_URL: "https://localhost:8443", DATABASE_URL: "postgresql://synthetic:password@test.invalid/staging", DIRECT_URL: "postgresql://synthetic:password@test.invalid/staging",
  MFA_ENCRYPTION_KEY: "a".repeat(64), EMAIL_VERIFICATION_SECRET: "synthetic-test-value-".repeat(3), RESEND_API_KEY: "synthetic-only", EMAIL_FROM: "Test <hello@joinbrightway.me>",
  R2_ACCOUNT_ID: "b".repeat(32), R2_ACCESS_KEY_ID: "synthetic-only", R2_SECRET_ACCESS_KEY: "synthetic-only", R2_BUCKET: "staging-photos", R2_IDENTITY_BUCKET: "staging-private-identity", MANUAL_IDENTITY_RETENTION_DAYS: "30",
}; }
test("staging preflight requires HTTPS, production cookies and isolated-stage acknowledgement", () => {
  assert.equal(validateStagingEnvironment(configured()).valid, true);
  for (const values of [{ CLIENT_URL: "http://localhost:8443" }, { CLIENT_URL: "https://user:secret@host.invalid" }, { CLIENT_URL: "https://host.invalid/subpath" }, { NODE_ENV: "development" }, { STAGING_DATABASE_ACK: "" }, { BRIGHTWAY_STAGE: "production" }]) assert.throws(() => validateStagingEnvironment({ ...configured(), ...values }));
});
test("staging preflight fails closed on trust/storage/email/provider errors without exposing values", () => {
  for (const values of [{ MFA_ENCRYPTION_KEY: "short-sensitive-secret" }, { DATABASE_URL: "not-a-url-private-password" }, { DIRECT_URL: "postgresql://secret@ep-fixture-pooler.us.neon.tech/staging" }, { R2_IDENTITY_BUCKET: "staging-photos" }, { MANUAL_IDENTITY_RETENTION_DAYS: "365" }, { MANUAL_IDENTITY_HOLIDAYS: "2026-02-31" }, { PERSONA_API_KEY: "sensitive-provider-secret" }, { EMAIL_FROM: "BrightWay <onboarding@resend.dev>" }, { AUTH_TIMING: "true" }]) {
    assert.throws(() => validateStagingEnvironment({ ...configured(), ...values }), e => !Object.values(values).some(v => e.message.includes(v)));
  }
});
function lockClient(acquired = true) {
  const calls = []; return { calls, async connect() { calls.push("connect"); }, async query(sql) { calls.push(sql); return { rows: [{ acquired }] }; }, async end() { calls.push("end"); } };
}
test("hosted cleanup holds a dedicated session lock and releases it on successful completion", async () => {
  const client = lockClient();
  const result = await runLockedCleanup({ client, async cleanup() { assert.equal(client.calls.length, 2); return { purged: 1, deleted: 2, failed: 0 }; } });
  assert.deepEqual(result, { status: "success", purged: 1, deleted: 2, failed: 0 }); assert(client.calls[2].includes("pg_advisory_unlock")); assert.equal(client.calls.at(-1), "end");
});
test("a competing hosted cleanup skips all work and never unlocks another session's lock", async () => {
  const client = lockClient(false); assert.deepEqual(await runLockedCleanup({ client, async cleanup() { assert.fail("Must not run concurrently"); } }), { status: "skipped_locked" });
  assert.equal(client.calls.length, 3); assert.equal(client.calls.at(-1), "end");
});
test("failed cleanup releases its connection and retriable object deletions do not report success", async () => {
  const client = lockClient(); await assert.rejects(runLockedCleanup({ client, async cleanup() { throw Error("Injected failure"); } })); assert(client.calls[2].includes("pg_advisory_unlock")); assert.equal(client.calls.at(-1), "end");
  assert.equal((await runLockedCleanup({ client: lockClient(), cleanup: async () => ({ purged: 0, deleted: 1, failed: 1 }) })).status, "retry_pending");
});
test("hosted cleanup composes existing retention services and preserves a valid approved identity", async () => {
  const f = manualReviewFixture(); await f.service.submit(f.ownerId, f.submission()); await f.assign(); await f.decide(); f.advance(31 * 86400000);
  const result = await runIdentityCleanup({ prisma: f.db, storage: f.storage, now: f.now });
  assert.deepEqual(result, { purged: 1, deleted: 0, failed: 0 });
  assert.equal((await f.service.owner(f.ownerId)).identityVerified, true);
});
