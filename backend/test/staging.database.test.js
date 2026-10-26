import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { runLockedCleanup } from "../src/jobs/identity-cleanup.js";

test("hosted cleanup PostgreSQL session lock excludes overlap and releases after failures", {
  skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database",
}, async () => {
  const client = () => new Client({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 10000, query_timeout: 10000 });
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; }), held = new Promise(resolve => { release = resolve; });
  const first = runLockedCleanup({ client: client(), async cleanup() { entered(); await held; return { purged: 0, deleted: 0, failed: 0 }; } });
  // Race failures must not leave the waiting promise orphaned.
  first.catch(() => entered());
  try {
    await started;
    assert.deepEqual(await runLockedCleanup({ client: client(), async cleanup() { assert.fail("Concurrent cleanup must not run"); } }), { status: "skipped_locked" });
  } finally { release(); await first; }
  await assert.rejects(runLockedCleanup({ client: client(), async cleanup() { throw Error("Injected cleanup failure"); } }), /Injected cleanup failure/);
  assert.equal((await runLockedCleanup({ client: client(), cleanup: async () => ({ purged: 0, deleted: 0, failed: 0 }) })).status, "success");
});
