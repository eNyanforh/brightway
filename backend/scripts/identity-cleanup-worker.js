import { writeFile, rename } from "node:fs/promises";
import { Client } from "pg";
import { validateStagingEnvironment } from "./check-staging-env.js";
import { runIdentityCleanup, runLockedCleanup } from "../src/jobs/identity-cleanup.js";

try { validateStagingEnvironment(process.env); }
catch { console.error("Cleanup worker configuration failed preflight."); process.exit(1); }
const { prisma } = await import("../src/config/database.js");
const { createManualIdentityStorage } = await import("../src/modules/manual-identity/manual-identity.storage.js");
const storage = createManualIdentityStorage();
const path = "/state/identity-cleanup.json";
let stopping = false, wake;
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { stopping = true; wake?.(); });
try {
  while (!stopping) {
    const startedAt = new Date().toISOString();
    let outcome;
    try {
      const client = new Client({ connectionString: process.env.DIRECT_URL, connectionTimeoutMillis: 10000, query_timeout: 10000 });
      outcome = await runLockedCleanup({ client, cleanup: () => runIdentityCleanup({ prisma, storage }) });
    } catch { outcome = { status: "failed", message: "Check database, migrations and private storage; values hidden." }; }
    const record = { job: "identity-cleanup", startedAt, completedAt: new Date().toISOString(), ...outcome };
    console.log(JSON.stringify(record));
    // An unsuccessful/locked run does not impersonate a successful heartbeat.
    if (outcome.status !== "skipped_locked") {
      await writeFile(`${path}.tmp`, JSON.stringify(record), { mode: 0o600 });
      await rename(`${path}.tmp`, path);
    }
    if (!stopping) await new Promise(resolve => {
      const timer = setTimeout(() => { wake = undefined; resolve(); }, 15 * 60000);
      wake = () => { clearTimeout(timer); wake = undefined; resolve(); };
    });
  }
} finally { await prisma.$disconnect(); }
