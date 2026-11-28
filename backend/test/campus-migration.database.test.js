import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

test("Campus additive migration backfills both legacy engine types and preserves identity and dependent records", {
  skip: !process.env.TEST_DATABASE_URL && "Requires an isolated TEST_DATABASE_URL",
}, async () => {
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    const schema = "campus_migration_" + randomUUID().replaceAll("-", "");
    // Disposable schema in the isolated test database. Always rolled back;
    // never modify the deployed Campus tables or their migration history.
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query(`
      CREATE TYPE "CampusEngine" AS ENUM ('GRADE_SCHOOL', 'TVET');
      CREATE TABLE "VirtualCampus" ("organizationId" TEXT PRIMARY KEY, "engine" "CampusEngine" NOT NULL, "version" INTEGER NOT NULL);
      CREATE TABLE "LearnerRecord" ("id" TEXT PRIMARY KEY, "campusId" TEXT REFERENCES "VirtualCampus"("organizationId"), "result" TEXT);
      INSERT INTO "VirtualCampus" VALUES ('school', 'GRADE_SCHOOL', 7), ('training', 'TVET', 12);
      INSERT INTO "LearnerRecord" VALUES ('student', 'school', 'historical grade'), ('learner', 'training', 'historical competency');
    `);
    const before = (await client.query('SELECT * FROM "LearnerRecord" ORDER BY "id"')).rows;
    await client.query(await readFile(new URL("../prisma/migrations/20261119230000_campus_enabled_engines/migration.sql", import.meta.url), "utf8"));
    const rows = (await client.query('SELECT "organizationId", "engine", "version", "enabledEngines"::text AS engines FROM "VirtualCampus" ORDER BY "organizationId"')).rows;
    assert.deepEqual(rows, [
      { organizationId: "school", engine: "GRADE_SCHOOL", version: 7, engines: "{GRADE_SCHOOL}" },
      { organizationId: "training", engine: "TVET", version: 12, engines: "{TVET}" },
    ]);
    assert.deepEqual((await client.query('SELECT * FROM "LearnerRecord" ORDER BY "id"')).rows, before);
    await client.query(`UPDATE "VirtualCampus" SET "enabledEngines" = ARRAY['GRADE_SCHOOL', 'TVET']::"CampusEngine"[] WHERE "organizationId" = 'school'`);
    for (const [sql, code] of [
      [`UPDATE "VirtualCampus" SET "enabledEngines" = '{}'`, "23514"],
      [`UPDATE "VirtualCampus" SET "enabledEngines" = '{TVET,TVET}'`, "23514"],
      [`UPDATE "VirtualCampus" SET "enabledEngines" = NULL`, "23502"],
      [`UPDATE "VirtualCampus" SET "enabledEngines" = '{TVET}' WHERE "organizationId" = 'school'`, "23514"],
      [`INSERT INTO "VirtualCampus" VALUES ('school', 'GRADE_SCHOOL', 1, '{GRADE_SCHOOL}')`, "23505"],
    ]) {
      await client.query("SAVEPOINT invalid_configuration");
      await assert.rejects(client.query(sql), { code });
      await client.query("ROLLBACK TO SAVEPOINT invalid_configuration");
    }
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
