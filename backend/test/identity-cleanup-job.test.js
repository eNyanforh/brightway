import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cleanupTaskPaths, readCleanupStatus, runCleanupJob } from "../scripts/run-identity-cleanup-job.js";

async function fixture(t, source) {
  const root = await mkdtemp(join(tmpdir(), "brightway cleanup "));
  t.after(() => rm(root, { recursive: true, force: true }));
  const scripts = join(root, "backend/scripts");
  const stateDir = join(root, "local logs");
  await mkdir(scripts, { recursive: true });
  await mkdir(stateDir, { recursive: true });
  await writeFile(join(scripts, "cleanup-manual-identity-reviews.js"), source);
  return { root, stateDir };
}

test("cleanup job runs the existing entry point from backend, records counts and keeps raw output private", async (t) => {
  const paths = await fixture(t, `
    if (!process.cwd().endsWith('backend')) process.exit(9);
    console.error('fake-secret-that-must-not-be-logged');
    console.log('Identity cleanup: 1 snapshots purged; 2 objects deleted; 0 deletions pending retry.');
  `);
  const result = await runCleanupJob(paths);
  assert.equal(result.status, "SUCCEEDED");
  assert.deepEqual(result.counts, { snapshotsPurged: 1, objectsDeleted: 2, pendingRetry: 0 });
  assert.deepEqual(await readCleanupStatus(paths.stateDir), result);
  const log = await readFile(join(paths.stateDir, `cleanup-${result.startedAt.slice(0, 10)}.log`), "utf8");
  assert.equal(log.includes("fake-secret"), false);
  assert.equal(log.trim().split("\n").length, 2);
});

test("pending deletions and nonzero child exits remain failures", async (t) => {
  const paths = await fixture(t, `
    console.log('Identity cleanup: 3 snapshots purged; 4 objects deleted; 2 deletions pending retry.');
    process.exitCode = 1;
  `);
  const result = await runCleanupJob(paths);
  assert.equal(result.status, "FAILED");
  assert.equal(result.reason, "DELETIONS_PENDING_RETRY");
  assert.equal(result.counts.pendingRetry, 2);
  assert.equal(result.exitCode, 1);
});

test("missing summaries and excessive output cannot be reported as successful cleanup", async (t) => {
  for (const source of ["console.log('completed');", `
    console.log('x'.repeat(17000));
    console.log('Identity cleanup: 0 snapshots purged; 0 objects deleted; 0 deletions pending retry.');
  `]) {
    const paths = await fixture(t, source);
    const result = await runCleanupJob(paths);
    assert.equal(result.status, "FAILED");
    assert.equal(result.counts, null);
  }
});

test("child process launch errors are recorded without leaking exception text", async (t) => {
  const paths = await fixture(t, "process.exit(0);");
  const result = await runCleanupJob({ ...paths, nodePath: join(paths.root, "missing-node") });
  assert.equal(result.status, "FAILED");
  assert.equal(result.reason, "PROCESS_START_FAILED");
  assert.equal(result.exitCode, null);
  assert.deepEqual(await readCleanupStatus(paths.stateDir), result);
});

test("log rotation deletes only this job's old daily logs and preserves latest status and other files", async (t) => {
  const paths = await fixture(t, "console.log('Identity cleanup: 0 snapshots purged; 0 objects deleted; 0 deletions pending retry.');");
  const old = join(paths.stateDir, "cleanup-2020-01-01.log");
  const unrelated = join(paths.stateDir, "other.log");
  await writeFile(old, "old");
  await writeFile(unrelated, "leave alone");
  await utimes(old, new Date("2020-01-01"), new Date("2020-01-01"));
  await runCleanupJob(paths);
  const names = await readdir(paths.stateDir);
  assert.equal(names.includes("cleanup-2020-01-01.log"), false);
  assert.equal(names.includes("other.log"), true);
  assert.equal(names.includes("latest.json"), true);
  assert.equal(names.some((name) => name.endsWith(".tmp")), false);
});

test("task identity is stable per checkout and missing local configuration fails closed", async () => {
  const first = cleanupTaskPaths("/project/one", "/local");
  assert.deepEqual(cleanupTaskPaths("/project/one", "/local"), first);
  assert.notEqual(cleanupTaskPaths("/project/two", "/local").taskName, first.taskName);
  assert.throws(() => cleanupTaskPaths("/project", ""), /LOCALAPPDATA/);
});
