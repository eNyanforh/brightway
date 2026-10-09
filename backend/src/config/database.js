
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Create a PostgreSQL driver adapter.
 *
 * DATABASE_URL points to Neon's pooled endpoint,
 * while Prisma CLI migrations use DIRECT_URL.
 */
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});

/**
 * Export a single Prisma client instance.
 * All BrightWay modules should reuse this instance.
 */
export const prisma = new PrismaClient({
  adapter,
});
