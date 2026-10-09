
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma CLI configuration.
 *
 * Prisma uses the direct database connection
 * for migrations and schema management.
 *
 * Our Express runtime will use DATABASE_URL.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
  },

  datasource: {
    url: env("DIRECT_URL"),
  },
});
