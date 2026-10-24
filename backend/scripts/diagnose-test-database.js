import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { validateTestDatabase } from "./check-database.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env"), quiet: true });
let prisma;
function safeMessage(error) {
  return String(error?.message ?? "Unknown error")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[connection string hidden]")
    .replace(/(password\s*[=:]\s*)[^\s,;]+/gi, "$1[hidden]")
    .slice(-700);
}
async function measure(label, action) {
  const start = performance.now();
  try {
    const result = await action();
    console.log(`${label}: PASS (${Math.round(performance.now() - start)} ms)`);
    return result;
  } catch (error) {
    console.log(`${label}: FAIL (${Math.round(performance.now() - start)} ms)`);
    throw error;
  }
}
try {
  const url = validateTestDatabase(process.env);
  console.log("Target: isolated TEST_DATABASE_URL; credentials are hidden. Read-only checks only.");
  const testPath = resolve(root, "test/identity.database.test.js");
  console.log("Database test includes queue processing:", existsSync(testPath) && readFileSync(testPath, "utf8").includes("queue.processBatch"));
  console.log("Queue implementation present:", existsSync(resolve(root, "src/modules/identity/identity.queue.js")));
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2, connectionTimeoutMillis: 10000, query_timeout: 10000 }),
    transactionOptions: { maxWait: 10000, timeout: 15000 } });
  console.log("Generated client includes queue model:", Boolean(prisma.identityWebhookJob));
  for (let i = 1; i <= 6; i++) await measure(`SELECT 1, sample ${i}`, () => prisma.$queryRaw`SELECT 1 AS ok`);
  const tables = await measure("Queue table lookup", () => prisma.$queryRaw`SELECT to_regclass('public."IdentityWebhookJob"')::text AS queue_table`);
  console.log("Queue table present:", Boolean(tables[0]?.queue_table));
  await measure("Four sequential reads inside a 15-second transaction", () => prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    for (let i = 1; i <= 4; i++) await measure(`  Transaction read ${i}`, () => tx.$queryRaw`SELECT 1 AS ok`);
  }));
} catch (error) {
  console.error("Diagnostic error:", {
    code: error.code ?? null,
    databaseCode: error.meta?.code ?? error.meta?.driverAdapterError?.cause?.originalCode ?? null,
    message: safeMessage(error),
  });
  process.exitCode = 1;
} finally {
  if (prisma) await prisma.$disconnect();
}