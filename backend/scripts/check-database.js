import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config } from "dotenv";

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function databaseIdentity(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Database URLs must be valid PostgreSQL connection strings."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
    throw new Error("Database URLs must name a PostgreSQL host and database.");
  }
  for (const key of ["host", "hostaddr", "port", "database", "dbname", "service"]) {
    if (url.searchParams.has(key)) throw new Error("Put the database host, port and name in the URL itself, not query parameters.");
  }
  let host = url.hostname.toLowerCase();
  if (host.endsWith(".neon.tech")) host = host.replace(/-pooler(?=\.)/, "");
  if (["localhost", "127.0.0.1", "[::1]"].includes(host)) host = "loopback";
  let name;
  try { name = decodeURIComponent(url.pathname.slice(1)); } catch { throw new Error("Database URLs contain an invalid database name."); }
  return `${host}:${url.port || "5432"}/${name}`;
}

// Compare database destinations, ignoring passwords/users and Neon pooling aliases.
export function validateTestDatabase(env) {
  if (!env.TEST_DATABASE_URL?.trim()) throw new Error("Set TEST_DATABASE_URL in backend/.env to a separate test database.");
  if (!env.DATABASE_URL?.trim() || !env.DIRECT_URL?.trim()) {
    throw new Error("Configure DATABASE_URL and DIRECT_URL so the test destination can be checked against the application database.");
  }
  const target = databaseIdentity(env.TEST_DATABASE_URL);
  if ([env.DATABASE_URL, env.DIRECT_URL].some((value) => databaseIdentity(value) === target)) {
    throw new Error("TEST_DATABASE_URL points to the application database. Choose a separate database or Neon branch.");
  }
  if (new URL(env.TEST_DATABASE_URL).hostname.includes("-pooler.") && new URL(env.TEST_DATABASE_URL).hostname.endsWith(".neon.tech")) {
    throw new Error("Use the direct, unpooled test connection string for TEST_DATABASE_URL.");
  }
  return env.TEST_DATABASE_URL;
}

function runNode(args, env) {
  const result = spawnSync(process.execPath, args, { cwd: backendRoot, env, stdio: "inherit" });
  if (result.error) throw new Error("Unable to start the database check process.");
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function main() {
  const flags = process.argv.slice(2);
  if (flags.some((flag) => flag !== "--migrate")) throw new Error("Usage: npm run test:database --workspace backend [-- --migrate]");
  config({ path: resolve(backendRoot, ".env"), quiet: true });
  const url = validateTestDatabase(process.env);
  // Every child receives ONLY the test destination for all database variables.
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url, TEST_DATABASE_URL: url, NODE_ENV: "test" };
  const files = readdirSync(resolve(backendRoot, "test"))
    .filter((file) => file.endsWith(".database.test.js"))
    .sort().map((file) => `test/${file}`);
  if (!files.length) throw new Error("No database integration test files were found.");
  if (flags.includes("--migrate")) {
    const prisma = require.resolve("prisma/build/index.js");
    console.log("Applying pending migrations to the separate test database…");
    runNode([prisma, "migrate", "deploy", "--config", "prisma.config.ts"], env);
    runNode([prisma, "generate", "--config", "prisma.config.ts"], env);
  }
  console.log(`Running ${files.length} database integration test files…`);
  // Avoid starting every integration suite against the remote test branch at once.
  // Races within each suite still run concurrently and retain their assertions.
  runNode(["--test", "--test-concurrency=1", ...files], env);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
