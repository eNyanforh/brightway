
import "dotenv/config";
import { z } from "zod";

/**
 * Validate backend configuration at startup.
 *
 * If a required setting is invalid, the application
 * stops immediately instead of running incorrectly.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().min(1).max(65535).default(5000),

  CLIENT_URL: z.url(),
  DATABASE_URL: z.string().url(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error(
    "Invalid environment configuration:",
    z.prettifyError(result.error)
  );

  process.exit(1);
}

export const env = result.data;
