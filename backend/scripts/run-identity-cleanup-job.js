import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const summaryPattern = /^Identity cleanup: (\d+) snapshots purged; (\d+) objects deleted; (\d+) deletions pending retry\.$/m;

export function cleanupTaskPaths(root = projectRoot, localAppData = process.env.LOCALAPPDATA) {
  if (!localAppData) throw new Error("Windows LOCALAPPDATA is unavailable.");
  const canonicalRoot = resolve(root).toLowerCase();
  const key = createHash("sha256").update(canonicalRoot).digest("hex").slice(0, 12);
  return {
    taskName: `BrightWay-IdentityCleanup-${key}`,
    stateDir: join(localAppData, "BrightWay", "IdentityCleanup", key),
  };
}

async function persist(stateDir, result) {
  const temporary = join(stateDir, `latest-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, join(stateDir, "latest.json"));
  } finally {
    await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; });
  }
  const date = result.startedAt.slice(0, 10);
  await appendFile(join(stateDir, `cleanup-${date}.log`), `${JSON.stringify(result)}\n`, { mode: 0o600 });
}

async function pruneOldLogs(stateDir, time) {
  for (const name of await readdir(stateDir)) {
    if (!/^cleanup-\d{4}-\d{2}-\d{2}\.log$/.test(name)) continue;
    const path = join(stateDir, name);
    const info = await stat(path);
    if (info.isFile() && info.mtimeMs < time - 30 * 86400_000) await unlink(path);
  }
}

function executeCleanup(root, nodePath) {
  return new Promise((done) => {
    let output = "";
    let tooLarge = false;
    let settled = false;
    const finish = (result) => {
      if (!settled) { settled = true; done(result); }
    };
    const child = spawn(nodePath, [join(root, "backend/scripts/cleanup-manual-identity-reviews.js")], {
      cwd: join(root, "backend"),
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (!tooLarge && output.length + chunk.length <= 16_384) output += chunk;
      else tooLarge = true;
    });
    // Drain provider/database errors without copying potentially sensitive values into logs.
    child.stderr.resume();
    child.on("error", () => finish({ code: null, match: null, reason: "PROCESS_START_FAILED" }));
    child.on("close", (code) => finish({
      code,
      match: tooLarge ? null : output.match(summaryPattern),
      reason: "CLEANUP_FAILED_OR_SUMMARY_MISSING",
    }));
  });
}

export async function runCleanupJob({ root = projectRoot, stateDir, nodePath = process.execPath } = {}) {
  stateDir ??= cleanupTaskPaths(root).stateDir;
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const startedAt = new Date().toISOString();
  const initial = { status: "RUNNING", startedAt };
  // Fail before changing data when the local status/log destination cannot be written.
  await persist(stateDir, initial);
  const execution = await executeCleanup(root, nodePath);
  const values = execution.match?.slice(1).map(Number);
  const validCounts = values?.every((value) => Number.isSafeInteger(value) && value >= 0);
  const counts = validCounts ? { snapshotsPurged: values[0], objectsDeleted: values[1], pendingRetry: values[2] } : null;
  const succeeded = execution.code === 0 && counts !== null && counts.pendingRetry === 0;
  const result = {
    status: succeeded ? "SUCCEEDED" : "FAILED",
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: execution.code,
    counts,
    ...(!succeeded ? { reason: counts?.pendingRetry ? "DELETIONS_PENDING_RETRY" : execution.reason } : {}),
  };
  await persist(stateDir, result);
  await pruneOldLogs(stateDir, Date.now());
  return result;
}

export async function readCleanupStatus(stateDir) {
  try { return JSON.parse(await readFile(join(stateDir, "latest.json"), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runCleanupJob();
    console.log(JSON.stringify(result));
    if (result.status !== "SUCCEEDED") process.exitCode = 1;
  } catch {
    console.error("Scheduled cleanup failed. Check the local log directory and run the existing cleanup command manually for diagnosis.");
    process.exitCode = 1;
  }
}
