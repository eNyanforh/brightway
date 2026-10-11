import "dotenv/config";
import { performance } from "node:perf_hooks";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing.");
  process.exit(1);
}

const { prisma } = await import("../src/config/database.js");

try {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const started = performance.now();

    await prisma.$queryRaw`SELECT 1`;

    console.info(
      `[database probe] SELECT 1 attempt ${attempt}: ${
        (performance.now() - started).toFixed(1)
      } ms`
    );
  }
} catch {
  console.error(
    "Database probe failed. Check the connection and environment settings."
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}