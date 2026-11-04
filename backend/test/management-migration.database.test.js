import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";

test("database forward migration preserves historical personal actors and grants without copying credentials into management", { skip: !process.env.TEST_DATABASE_URL && "Set TEST_DATABASE_URL to a separate migrated test database" }, async () => {
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  const schema = `mg_migration_${randomUUID().replaceAll("-", "")}`, root = new URL("../prisma/migrations/", import.meta.url);
  const owner = randomUUID(), reviewer = randomUUID(), approver = randomUUID(), request = randomUUID(), target = "2026-12-01T12:00:00.000Z";
  try {
    await client.connect(); await client.query(`CREATE SCHEMA "${schema}"`); await client.query(`SET search_path TO "${schema}"`);
    const folders = (await readdir(root, { withFileTypes: true })).filter(row => row.isDirectory()).map(row => row.name).sort();
    assert.equal(folders.at(-1), "20261031130000_management_authentication_realm");
    for (const folder of folders.slice(0, -1)) await client.query(await readFile(new URL(`${folder}/migration.sql`, root), "utf8"));
    for (const [id, label] of [[owner, "owner"], [reviewer, "reviewer"], [approver, "approver"]]) {
      const person = randomUUID();
      await client.query('INSERT INTO "Person" (id, "firstName", "lastName", "updatedAt") VALUES ($1, $2, $2, NOW())', [person, label]);
      await client.query('INSERT INTO "Account" (id, username, email, "passwordHash", "personId", "platformRole", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())', [id, label, `${label}@historical.example.invalid`, "historical-password-must-not-copy", person, label === "reviewer" ? "CREDENTIAL_REVIEWER" : "MEMBER"]);
    }
    await client.query('INSERT INTO "OrganizationRequest" (id, "applicantId", "assignedAgentId", "decidedById", status, version, "idempotencyKey", "inputHash", fingerprint, name, type, "representativeRole", "countryCode", region, city, address, "offersTraining", "targetAt", "decidedAt", "updatedAt") VALUES ($1,$2,$3,$4,\'APPROVED\',4,$5,$6,$7,\'Historical School\',\'SCHOOL\',\'Director\',\'LR\',\'Montserrado\',\'Monrovia\',\'Synthetic address\',true,$8,NOW(),NOW())', [request, owner, reviewer, approver, randomUUID(), "a".repeat(64), randomUUID(), target]);
    await client.query(await readFile(new URL(`${folders.at(-1)}/migration.sql`, root), "utf8"));
    const row = (await client.query('SELECT "assignedAgentId", "decidedById", version, "targetAt" FROM "OrganizationRequest" WHERE id=$1', [request])).rows[0];
    assert.equal(row.assignedAgentId, reviewer); assert.equal(row.decidedById, approver); assert.equal(row.version, 4); assert.equal(row.targetAt.toISOString(), target);
    assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM "ManagementStaff"')).rows[0].count, 0);
    assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM "ReviewPrincipal" WHERE "accountId" = id AND "staffId" IS NULL')).rows[0].count, 3);
    assert.equal((await client.query('SELECT "platformRole", "passwordHash" FROM "Account" WHERE id=$1', [reviewer])).rows[0].passwordHash, "historical-password-must-not-copy");
    await assert.rejects(client.query('UPDATE "OrganizationRequest" SET "assignedAgentId"=$1 WHERE id=$2', [randomUUID(), request]), error => error.code === "23503");
  } finally {
    try { await client.query("ROLLBACK"); await client.query("SET search_path TO public"); await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await client.end(); }
  }
});
