import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as wait } from "node:timers/promises";

import { createIdentityService } from "../src/modules/identity/identity.service.js";
import { createIdentityQueue } from "../src/modules/identity/identity.queue.js";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env"), quiet: true });
const { prisma } = await import("../src/config/database.js");
const flags = process.argv.slice(2);
if (flags.some((flag) => flag !== "--watch")) {
  console.error("Usage: node scripts/process-identity-webhooks.js [--watch]"); process.exit(1);
}
const queue = createIdentityQueue({ prisma, identity: createIdentityService({ prisma }) });
let stopped = false;
process.on("SIGINT", () => { stopped = true; });
process.on("SIGTERM", () => { stopped = true; });
try {
  do {
    try {
      const result = await queue.processBatch();
      if (result.processed || result.retried || result.failed || !flags.includes("--watch")) console.log("Identity webhook queue:", result);
    } catch {
      console.error("Identity queue unavailable. Check database connectivity and pending migrations.");
      if (!flags.includes("--watch")) { process.exitCode = 1; break; }
    }
    if (flags.includes("--watch") && !stopped) await wait(2000);
  } while (flags.includes("--watch") && !stopped);
  const failed = await prisma.identityWebhookJob.count({ where: { state: "FAILED" } });
  if (failed) { console.error(`Identity webhook jobs needing operator attention: ${failed}`); process.exitCode = 1; }
} catch { console.error("Identity queue stopped due to a database error."); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
