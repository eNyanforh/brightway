import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const timingEnabled =
  process.env.AUTH_TIMING === "true" &&
  process.env.NODE_ENV !== "production";

/**
 * Runtime uses DATABASE_URL.
 * Prisma CLI migrations use DIRECT_URL in prisma.config.ts.
 */
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});

/**
 * All backend modules reuse this client.
 */
export const prisma = new PrismaClient({
  adapter,
  log: timingEnabled
    ? [{ emit: "event", level: "query" }]
    : [],
});

if (timingEnabled) {
  let queryNumber = 0;

  prisma.$on("query", (event) => {
    queryNumber += 1;

    console.info(
      `[database timing] query ${queryNumber}: ${event.duration} ms`
    );
  });
}