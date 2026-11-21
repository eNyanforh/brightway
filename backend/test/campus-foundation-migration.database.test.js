import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";

const migration = "20261120090000_campus_domain_foundation";
test("Campus foundation migration preserves legacy records and refuses inconsistent data atomically", {
  skip: !process.env.TEST_DATABASE_URL && "Requires a migrated isolated TEST_DATABASE_URL",
}, async t => {
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  const schema = "campus_foundation_" + randomUUID().replaceAll("-", "");
  const root = new URL("../prisma/migrations/", import.meta.url);
  const snapshot = async () => {
    const result = {};
    for (const table of ["VirtualCampus", "VirtualCampusAudit", "Organization", "GradeSchoolStudent", "GradeSchoolRegistration", "TvetLearner", "TvetEnrolment", "BillingCharge", "BillingLedgerEntry", "CampusAnnouncement"])
      result[table] = (await client.query(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY row_to_json(t)::text`)).rows.map(r => r.row);
    return result;
  };
  try {
    await client.connect();
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    const folders = (await readdir(root, { withFileTypes: true })).filter(r => r.isDirectory()).map(r => r.name).sort();
    for (const folder of folders.filter(f => f < migration)) await client.query(await readFile(new URL(`${folder}/migration.sql`, root), "utf8"));
    const sql = await readFile(new URL(`${migration}/migration.sql`, root), "utf8");
    // Only this disposable schema is seeded. Synthetic historical identities are
    // intentionally partial; verification and account records are never fabricated
    // by the production migration.
    await client.query(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      INSERT INTO "Person" (id,"firstName","lastName","updatedAt") VALUES ('person','Historic','Learner',NOW());
      INSERT INTO "Account" (id,username,email,"passwordHash","personId","updatedAt") VALUES ('actor','historic','historic@example.invalid','synthetic','person',NOW());
      INSERT INTO "OrganizationRequest" (id,"applicantId","idempotencyKey","inputHash",fingerprint,name,type,"representativeRole","countryCode",region,city,address,"offersTraining","targetAt","updatedAt")
        SELECT id,'actor',id,repeat('a',64),id,id,'SCHOOL','Owner','LR','Test','Test','Test',true,NOW(),NOW() FROM (VALUES ('school-request'),('training-request')) r(id);
      INSERT INTO "Organization" (id,"requestId",name,type,"offersTraining","verifiedAt","updatedAt") VALUES ('school','school-request','School','SCHOOL',true,NOW(),NOW()),('training','training-request','Training','SCHOOL',true,NOW(),NOW());
      INSERT INTO "VirtualCampus" ("organizationId",engine,"enabledEngines","displayName",status,version,"activatedAt","updatedAt") VALUES
        ('school','GRADE_SCHOOL','{GRADE_SCHOOL}','Historic School','ACTIVE',7,'2026-01-01',NOW()),
        ('training','TVET','{TVET}','','SETUP',3,NULL,NOW());
      INSERT INTO "VirtualCampusAudit" (id,"campusId","actorId",action,data) VALUES ('audit','school','actor','ACTIVATE','{"historic":true}');
      INSERT INTO "CampusAnnouncement" (id,"campusId","authorId","requestKey","inputHash",title,body) VALUES ('announcement','school','actor','notice',repeat('a',64),'Historic notice','Retain this');
      INSERT INTO "GradeSchoolStudent" (id,"campusId","accountId") VALUES ('student','school','actor');
      INSERT INTO "GradeSchoolClass" (id,"campusId",name) VALUES ('class','school','Class 1');
      INSERT INTO "GradeSchoolSection" (id,"campusId","classId",name,capacity) VALUES ('section','school','class','A',30);
      INSERT INTO "GradeSchoolYear" (id,"campusId",name,"startsOn","endsOn") VALUES ('year','school','2026','2026-01-01','2026-12-31');
      INSERT INTO "GradeSchoolPeriod" (id,"campusId","yearId",name,kind,"startsOn","endsOn") VALUES ('period','school','year','First','SEMESTER','2026-01-01','2026-06-30');
      INSERT INTO "GradeSchoolRegistration" (id,"campusId","studentId","periodId","sectionId",source) VALUES ('registration','school','student','period','section','DIRECT');
      INSERT INTO "TvetProgram" (id,"campusId",name) VALUES ('tvet-program','training','Welding');
      INSERT INTO "TvetIntake" (id,"campusId","programId",name,"startsOn","endsOn") VALUES ('intake','training','tvet-program','First','2026-01-01','2026-06-30');
      INSERT INTO "TvetSection" (id,"campusId","intakeId",name,capacity) VALUES ('workshop','training','intake','A',20);
      INSERT INTO "TvetLearner" (id,"campusId","accountId") VALUES ('learner','training','actor');
      INSERT INTO "TvetEnrolment" (id,"campusId","learnerId","programId","intakeId","sectionId",source) VALUES ('enrolment','training','learner','tvet-program','intake','workshop','DIRECT');
      INSERT INTO "BillingAccount" ("campusId") VALUES ('training');
      INSERT INTO "BillingCharge" (id,"campusId","unitKey",engine,"learnerAccountId","tvetEnrolmentId",label) VALUES ('charge','training','historic-unit','TVET','actor','enrolment','Historic US$1');
      INSERT INTO "BillingLedgerEntry" (id,"campusId",kind,"chargeId","amountCents") VALUES ('ledger','training','CHARGE','charge',100);
      INSERT INTO "Program" (id,"organizationId","authorId","requestKey","inputHash",title,description,type,duration,field,"studyMode","countryCode",location,requirements,"updatedAt") VALUES ('program','school','actor','program',repeat('a',64),'Program','Description','CERTIFICATE','One year','Training','IN_PERSON','LR','Test','None',NOW());
      INSERT INTO "AdmissionCycle" (id,"organizationId","programId","authorId","requestKey","inputHash",title,"opensAt",deadline,questions,"updatedAt") VALUES ('cycle','school','program','actor','cycle',repeat('a',64),'Admissions','2026-01-01','2026-02-01','[]',NOW());
      INSERT INTO "AdmissionApplication" (id,"cycleId","applicantId",answers,"updatedAt") VALUES ('application','cycle','actor','{}',NOW());
      COMMIT;
    `);
    const before = await snapshot();
    const rejectedMigration = async (corrupt, expected) => {
      await client.query("BEGIN");
      await client.query(corrupt);
      await assert.rejects(client.query(sql), expected);
      await client.query("ROLLBACK");
      assert.deepEqual(await snapshot(), before);
      assert.equal((await client.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema=$1 AND table_name='CampusEngineConfiguration'`, [schema])).rows[0].n, 0);
    };
    await t.test("duplicate Campus identities stop with no silent deduplication", () => rejectedMigration(`ALTER TABLE "VirtualCampus" DROP CONSTRAINT "VirtualCampus_pkey" CASCADE; INSERT INTO "VirtualCampus" SELECT * FROM "VirtualCampus" WHERE "organizationId"='school'`, /duplicate organization Campus identities/));
    await t.test("cross-organization program links stop before adding constraints", () => rejectedMigration(`UPDATE "AdmissionCycle" SET "organizationId"='training'`, /cross-organization/));
    await t.test("cross-organization admission links stop without deleting enrolments", () => rejectedMigration(`UPDATE "TvetEnrolment" SET source='ADMISSION',"admissionId"='application'`, /admission belongs to another institution/));
    await t.test("unexpected academic records do not silently enable an engine; DDL rolls back", () => rejectedMigration(`INSERT INTO "TvetProgram" (id,"campusId",name) VALUES ('unexpected','school','Unexpected engine')`, /records exist without the corresponding enabled engine/));
    await t.test("partial configuration is retained for review and existing academics, finances and history are unchanged", async () => {
      await client.query(sql);
      const after = await snapshot();
      for (const record of after.VirtualCampus) delete record.configurationStatus;
      for (const record of after.VirtualCampusAudit) delete record.campusVersion;
      for (const table of ["GradeSchoolStudent", "TvetLearner"]) for (const record of after[table]) delete record.engine;
      assert.deepEqual(after, before);
      assert.deepEqual((await client.query('SELECT "organizationId","configurationStatus" FROM "VirtualCampus" ORDER BY "organizationId"')).rows,
        [{ organizationId: "school", configurationStatus: "READY" }, { organizationId: "training", configurationStatus: "REVIEW_REQUIRED" }]);
      assert.deepEqual((await client.query('SELECT "campusId",engine,status FROM "CampusEngineConfiguration" ORDER BY "campusId"')).rows,
        [{ campusId: "school", engine: "GRADE_SCHOOL", status: "REVIEW_REQUIRED" }, { campusId: "training", engine: "TVET", status: "REVIEW_REQUIRED" }]);
      await assert.rejects(client.query(`UPDATE "AdmissionCycle" SET "programId"='missing'`), { code: "23503" });
      await assert.rejects(client.query(`UPDATE "TvetProgram" SET "discoverProgramId"='program'`), { code: "23503" });
      await assert.rejects(client.query(`UPDATE "TvetEnrolment" SET source='ADMISSION',"admissionId"='application'`), /Admission must belong to the same institution/);
      await client.query(`UPDATE "GradeSchoolRegistration" SET source='ADMISSION',"admissionId"='application'`);
      await assert.rejects(client.query(`UPDATE "GradeSchoolStudent" SET "accountId"='other-account'`), /Learner identity is immutable/);
    });
  } finally {
    try { await client.query("ROLLBACK"); await client.query("SET search_path TO public"); await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await client.end(); }
  }
});
