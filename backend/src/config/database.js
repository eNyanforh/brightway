import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const timingEnabled =
  process.env.AUTH_TIMING === "true" &&
  process.env.NODE_ENV !== "production";

// Application connections use DATABASE_URL.
// Prisma migrations use DIRECT_URL in prisma.config.ts.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});

// All backend modules share this client.
export const prisma = new PrismaClient({
  adapter,

  transactionOptions: {
    // Wait up to 10 seconds to acquire a transaction.
    maxWait: 10000,

    // Allow an acquired transaction up to 15 seconds to finish.
    timeout: 15000,
  },

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