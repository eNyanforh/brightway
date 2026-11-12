-- CreateEnum
CREATE TYPE "TvetLearnerStatus" AS ENUM ('PRE_REGISTERED', 'ACTIVE', 'SUSPENDED', 'FORMER');

-- CreateEnum
CREATE TYPE "TvetEnrolmentStatus" AS ENUM ('PRE_REGISTERED', 'ACTIVE', 'SUSPENDED', 'WITHDRAWN', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TvetSubmissionStatus" AS ENUM ('DRAFT', 'FINAL');

-- CreateEnum
CREATE TYPE "TvetAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "TvetAssessmentKind" AS ENUM ('SCORE', 'COMPETENCY', 'PRACTICAL');

-- CreateEnum
CREATE TYPE "TvetOutcome" AS ENUM ('COMPETENT', 'NOT_YET_COMPETENT');

-- CreateEnum
CREATE TYPE "TvetSupportStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REVOKED');

-- CreateTable
CREATE TABLE "TvetProgram" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "feeMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "discoverProgramId" TEXT,

    CONSTRAINT "TvetProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TvetIntake" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "minimumAttendance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "requirements" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TvetIntake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TvetSection" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "TvetSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TvetModule" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TvetModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TvetAssignment" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "sectionId" TEXT,
    "moduleId" TEXT,
    "scopeKey" VARCHAR(80) NOT NULL,
    "instructorId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TvetAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TvetLearner" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "TvetLearnerStatus" NOT NULL DEFAULT 'PRE_REGISTERED',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TvetLearner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TvetEnrolment" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "admissionId" TEXT,
    "source" VARCHAR(12) NOT NULL,
    "status" "TvetEnrolmentStatus" NOT NULL DEFAULT 'PRE_REGISTERED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TvetEnrolment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TvetSupporter" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "supporterId" TEXT NOT NULL,
    "relationship" VARCHAR(20) NOT NULL,
    "status" "TvetSupportStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "TvetSupporter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TvetSchedule" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startsAt" INTEGER NOT NULL,
    "endsAt" INTEGER NOT NULL,
    "room" VARCHAR(100) NOT NULL,

    CONSTRAINT "TvetSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TvetAttendance" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "heldOn" DATE NOT NULL,
    "startsAt" INTEGER NOT NULL,
    "status" "TvetSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "TvetAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TvetAttendanceRecord" (
    "campusId" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "enrolmentId" TEXT NOT NULL,
    "status" "TvetAttendanceStatus" NOT NULL,

    CONSTRAINT "TvetAttendanceRecord_pkey" PRIMARY KEY ("attendanceId","enrolmentId")
);

-- CreateTable
CREATE TABLE "TvetAssessment" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "kind" "TvetAssessmentKind" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "maxScore" DOUBLE PRECISION,
    "passingMark" DOUBLE PRECISION,
    "heldOn" DATE NOT NULL,

    CONSTRAINT "TvetAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TvetResult" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "enrolmentId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "heldOn" DATE NOT NULL,
    "score" DOUBLE PRECISION,
    "outcome" "TvetOutcome" NOT NULL,
    "feedback" VARCHAR(500) NOT NULL,
    "status" "TvetSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "TvetResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TvetCertificate" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "enrolmentId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "number" VARCHAR(50) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revokedAt" TIMESTAMP(3),
    "revocationReason" VARCHAR(500),

    CONSTRAINT "TvetCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TvetProgram_campusId_id_key" ON "TvetProgram"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TvetProgram_campusId_name_key" ON "TvetProgram"("campusId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TvetIntake_campusId_id_key" ON "TvetIntake"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TvetIntake_campusId_programId_id_key" ON "TvetIntake"("campusId", "programId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TvetIntake_campusId_programId_name_key" ON "TvetIntake"("campusId", "programId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TvetSection_campusId_intakeId_id_key" ON "TvetSection"("campusId", "intakeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TvetSection_campusId_intakeId_name_key" ON "TvetSection"("campusId", "intakeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TvetModule_campusId_programId_id_key" ON "TvetModule"("campusId", "programId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TvetModule_campusId_programId_name_key" ON "TvetModule"("campusId", "programId", "name");

-- CreateIndex
CREATE INDEX "TvetAssignment_instructorId_campusId_intakeId_idx" ON "TvetAssignment"("instructorId", "campusId", "intakeId");

-- CreateIndex
CREATE UNIQUE INDEX "TvetAssignment_campusId_id_key" ON "TvetAssignment"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TvetAssignment_intakeId_scopeKey_key" ON "TvetAssignment"("intakeId", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "TvetLearner_campusId_id_key" ON "TvetLearner"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TvetLearner_campusId_accountId_key" ON "TvetLearner"("campusId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "TvetEnrolment_admissionId_key" ON "TvetEnrolment"("admissionId");

-- CreateIndex
CREATE INDEX "TvetEnrolment_campusId_intakeId_sectionId_status_id_idx" ON "TvetEnrolment"("campusId", "intakeId", "sectionId", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TvetEnrolment_campusId_id_key" ON "TvetEnrolment"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TvetEnrolment_learnerId_intakeId_key" ON "TvetEnrolment"("learnerId", "intakeId");

-- CreateIndex
CREATE INDEX "TvetSupporter_supporterId_status_idx" ON "TvetSupporter"("supporterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TvetSupporter_learnerId_supporterId_key" ON "TvetSupporter"("learnerId", "supporterId");

-- CreateIndex
CREATE INDEX "TvetSchedule_campusId_weekday_idx" ON "TvetSchedule"("campusId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "TvetSchedule_assignmentId_weekday_startsAt_key" ON "TvetSchedule"("assignmentId", "weekday", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "TvetAttendance_campusId_id_key" ON "TvetAttendance"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TvetAttendance_assignmentId_heldOn_startsAt_key" ON "TvetAttendance"("assignmentId", "heldOn", "startsAt");

-- CreateIndex
CREATE INDEX "TvetAttendanceRecord_enrolmentId_idx" ON "TvetAttendanceRecord"("enrolmentId");

-- CreateIndex
CREATE UNIQUE INDEX "TvetAssessment_campusId_id_key" ON "TvetAssessment"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TvetAssessment_assignmentId_title_key" ON "TvetAssessment"("assignmentId", "title");

-- CreateIndex
CREATE INDEX "TvetResult_enrolmentId_status_idx" ON "TvetResult"("enrolmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TvetResult_assessmentId_enrolmentId_attempt_key" ON "TvetResult"("assessmentId", "enrolmentId", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "TvetCertificate_enrolmentId_key" ON "TvetCertificate"("enrolmentId");

-- CreateIndex
CREATE UNIQUE INDEX "TvetCertificate_number_key" ON "TvetCertificate"("number");

-- CreateIndex
CREATE INDEX "TvetCertificate_campusId_issuedAt_idx" ON "TvetCertificate"("campusId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TvetCertificate_campusId_enrolmentId_key" ON "TvetCertificate"("campusId", "enrolmentId");

-- AddForeignKey
ALTER TABLE "TvetProgram" ADD CONSTRAINT "TvetProgram_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "VirtualCampus"("organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetProgram" ADD CONSTRAINT "TvetProgram_discoverProgramId_fkey" FOREIGN KEY ("discoverProgramId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetIntake" ADD CONSTRAINT "TvetIntake_campusId_programId_fkey" FOREIGN KEY ("campusId", "programId") REFERENCES "TvetProgram"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetSection" ADD CONSTRAINT "TvetSection_campusId_intakeId_fkey" FOREIGN KEY ("campusId", "intakeId") REFERENCES "TvetIntake"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetModule" ADD CONSTRAINT "TvetModule_campusId_programId_fkey" FOREIGN KEY ("campusId", "programId") REFERENCES "TvetProgram"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetAssignment" ADD CONSTRAINT "TvetAssignment_campusId_programId_intakeId_fkey" FOREIGN KEY ("campusId", "programId", "intakeId") REFERENCES "TvetIntake"("campusId", "programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetAssignment" ADD CONSTRAINT "TvetAssignment_campusId_intakeId_sectionId_fkey" FOREIGN KEY ("campusId", "intakeId", "sectionId") REFERENCES "TvetSection"("campusId", "intakeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetAssignment" ADD CONSTRAINT "TvetAssignment_campusId_programId_moduleId_fkey" FOREIGN KEY ("campusId", "programId", "moduleId") REFERENCES "TvetModule"("campusId", "programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetAssignment" ADD CONSTRAINT "TvetAssignment_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetLearner" ADD CONSTRAINT "TvetLearner_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "VirtualCampus"("organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetLearner" ADD CONSTRAINT "TvetLearner_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetEnrolment" ADD CONSTRAINT "TvetEnrolment_campusId_learnerId_fkey" FOREIGN KEY ("campusId", "learnerId") REFERENCES "TvetLearner"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetEnrolment" ADD CONSTRAINT "TvetEnrolment_campusId_programId_intakeId_fkey" FOREIGN KEY ("campusId", "programId", "intakeId") REFERENCES "TvetIntake"("campusId", "programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetEnrolment" ADD CONSTRAINT "TvetEnrolment_campusId_intakeId_sectionId_fkey" FOREIGN KEY ("campusId", "intakeId", "sectionId") REFERENCES "TvetSection"("campusId", "intakeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetEnrolment" ADD CONSTRAINT "TvetEnrolment_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "AdmissionApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetSupporter" ADD CONSTRAINT "TvetSupporter_campusId_learnerId_fkey" FOREIGN KEY ("campusId", "learnerId") REFERENCES "TvetLearner"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetSupporter" ADD CONSTRAINT "TvetSupporter_supporterId_fkey" FOREIGN KEY ("supporterId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetSchedule" ADD CONSTRAINT "TvetSchedule_campusId_assignmentId_fkey" FOREIGN KEY ("campusId", "assignmentId") REFERENCES "TvetAssignment"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetAttendance" ADD CONSTRAINT "TvetAttendance_campusId_assignmentId_fkey" FOREIGN KEY ("campusId", "assignmentId") REFERENCES "TvetAssignment"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetAttendanceRecord" ADD CONSTRAINT "TvetAttendanceRecord_campusId_attendanceId_fkey" FOREIGN KEY ("campusId", "attendanceId") REFERENCES "TvetAttendance"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetAttendanceRecord" ADD CONSTRAINT "TvetAttendanceRecord_campusId_enrolmentId_fkey" FOREIGN KEY ("campusId", "enrolmentId") REFERENCES "TvetEnrolment"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetAssessment" ADD CONSTRAINT "TvetAssessment_campusId_assignmentId_fkey" FOREIGN KEY ("campusId", "assignmentId") REFERENCES "TvetAssignment"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetResult" ADD CONSTRAINT "TvetResult_campusId_assessmentId_fkey" FOREIGN KEY ("campusId", "assessmentId") REFERENCES "TvetAssessment"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetResult" ADD CONSTRAINT "TvetResult_campusId_enrolmentId_fkey" FOREIGN KEY ("campusId", "enrolmentId") REFERENCES "TvetEnrolment"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetCertificate" ADD CONSTRAINT "TvetCertificate_campusId_enrolmentId_fkey" FOREIGN KEY ("campusId", "enrolmentId") REFERENCES "TvetEnrolment"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvetCertificate" ADD CONSTRAINT "TvetCertificate_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TvetProgram" ADD CONSTRAINT "TvetProgram_fee_check" CHECK ("feeMinor" BETWEEN 0 AND 100000000 AND "currency" ~ '^[A-Z]{3}$');
ALTER TABLE "TvetIntake" ADD CONSTRAINT "TvetIntake_dates_check" CHECK ("endsOn" >= "startsOn" AND "minimumAttendance" BETWEEN 0 AND 100 AND (("startedAt" IS NULL) = ("requirements" IS NULL)));
ALTER TABLE "TvetSection" ADD CONSTRAINT "TvetSection_capacity_check" CHECK ("capacity" BETWEEN 1 AND 500);
ALTER TABLE "TvetAssignment" ADD CONSTRAINT "TvetAssignment_scope_check" CHECK ("scopeKey" = COALESCE("sectionId", '*') || ':' || COALESCE("moduleId", '*'));
ALTER TABLE "TvetEnrolment" ADD CONSTRAINT "TvetEnrolment_source_check" CHECK ("source" IN ('DIRECT','ADMISSION','RETURNING') AND (("source" = 'ADMISSION') = ("admissionId" IS NOT NULL)));
ALTER TABLE "TvetEnrolment" ADD CONSTRAINT "TvetEnrolment_completion_check" CHECK (("status" = 'COMPLETED') = ("completedAt" IS NOT NULL));
ALTER TABLE "TvetSupporter" ADD CONSTRAINT "TvetSupporter_relationship_check" CHECK ("relationship" IN ('PARENT','GUARDIAN','SPONSOR'));
ALTER TABLE "TvetSchedule" ADD CONSTRAINT "TvetSchedule_time_check" CHECK ("weekday" BETWEEN 1 AND 7 AND "startsAt" BETWEEN 0 AND 1439 AND "endsAt" BETWEEN 1 AND 1440 AND "endsAt" > "startsAt");
ALTER TABLE "TvetAttendance" ADD CONSTRAINT "TvetAttendance_time_check" CHECK ("startsAt" BETWEEN 0 AND 1439 AND (("status" = 'FINAL') = ("finalizedAt" IS NOT NULL)));
ALTER TABLE "TvetAssessment" ADD CONSTRAINT "TvetAssessment_kind_check" CHECK (("kind" = 'SCORE' AND "maxScore" > 0 AND "maxScore" <= 100000 AND "passingMark" BETWEEN 0 AND 100 AND "maxScore" IS NOT NULL AND "passingMark" IS NOT NULL) OR ("kind" IN ('COMPETENCY','PRACTICAL') AND "maxScore" IS NULL AND "passingMark" IS NULL));
ALTER TABLE "TvetResult" ADD CONSTRAINT "TvetResult_attempt_check" CHECK ("attempt" BETWEEN 1 AND 100 AND ("score" IS NULL OR "score" >= 0) AND (("status" = 'FINAL') = ("finalizedAt" IS NOT NULL)));
CREATE UNIQUE INDEX "TvetResult_one_draft" ON "TvetResult" ("assessmentId","enrolmentId") WHERE "status" = 'DRAFT';
CREATE FUNCTION "tvet_result_integrity"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a RECORD; e RECORD;
BEGIN
 IF TG_OP = 'UPDATE' AND OLD."status" = 'FINAL' THEN RAISE EXCEPTION 'Final TVET results are immutable'; END IF;
 SELECT x.*,y."intakeId",y."sectionId",i."startsOn",i."endsOn" INTO a FROM "TvetAssessment" x JOIN "TvetAssignment" y ON y."id"=x."assignmentId" JOIN "TvetIntake" i ON i."id"=y."intakeId" WHERE x."id"=NEW."assessmentId" AND x."campusId"=NEW."campusId";
 SELECT * INTO e FROM "TvetEnrolment" WHERE "id"=NEW."enrolmentId" AND "campusId"=NEW."campusId";
 IF a."id" IS NULL OR e."id" IS NULL OR e."intakeId"<>a."intakeId" OR (a."sectionId" IS NOT NULL AND e."sectionId"<>a."sectionId") THEN RAISE EXCEPTION 'TVET assessment scope mismatch'; END IF;
 IF NEW."heldOn"<a."heldOn" OR NEW."heldOn"<a."startsOn" OR NEW."heldOn">a."endsOn" THEN RAISE EXCEPTION 'TVET result date outside training'; END IF;
 IF a."kind"='SCORE' THEN
  IF NEW."score" IS NULL OR NEW."score">a."maxScore" OR (NEW."outcome"='COMPETENT')<>(NEW."score"/a."maxScore"*100>=a."passingMark") THEN RAISE EXCEPTION 'Invalid TVET score or outcome'; END IF;
 ELSIF NEW."score" IS NOT NULL THEN RAISE EXCEPTION 'Competency assessments have no numeric score'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "TvetResult_integrity" BEFORE INSERT OR UPDATE ON "TvetResult" FOR EACH ROW EXECUTE FUNCTION "tvet_result_integrity"();
CREATE FUNCTION "tvet_attendance_integrity"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a RECORD; e RECORD;
BEGIN
 SELECT x."status",y."intakeId",y."sectionId" INTO a FROM "TvetAttendance" x JOIN "TvetAssignment" y ON y."id"=x."assignmentId" WHERE x."id"=NEW."attendanceId" AND x."campusId"=NEW."campusId";
 SELECT * INTO e FROM "TvetEnrolment" WHERE "id"=NEW."enrolmentId" AND "campusId"=NEW."campusId";
 IF a."status" IS NULL OR a."status"='FINAL' OR e."id" IS NULL OR e."intakeId"<>a."intakeId" OR (a."sectionId" IS NOT NULL AND e."sectionId"<>a."sectionId") THEN RAISE EXCEPTION 'Invalid or locked TVET attendance scope'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "TvetAttendanceRecord_integrity" BEFORE INSERT OR UPDATE ON "TvetAttendanceRecord" FOR EACH ROW EXECUTE FUNCTION "tvet_attendance_integrity"();
CREATE FUNCTION "tvet_final_attendance_lock"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD."status"='FINAL' THEN RAISE EXCEPTION 'Final TVET attendance is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER "TvetAttendance_final_lock" BEFORE UPDATE ON "TvetAttendance" FOR EACH ROW EXECUTE FUNCTION "tvet_final_attendance_lock"();
CREATE FUNCTION "tvet_certificate_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."snapshot" IS DISTINCT FROM OLD."snapshot" OR NEW."number"<>OLD."number" OR NEW."title"<>OLD."title" OR NEW."enrolmentId"<>OLD."enrolmentId" OR NEW."campusId"<>OLD."campusId" OR NEW."issuedAt"<>OLD."issuedAt" OR NEW."issuedById"<>OLD."issuedById" OR OLD."revokedAt" IS NOT NULL THEN RAISE EXCEPTION 'Issued TVET certificate evidence is immutable'; END IF;
 IF NEW."revokedAt" IS NULL OR NEW."revocationReason" IS NULL OR LENGTH(TRIM(NEW."revocationReason"))<1 OR NEW."version"<>OLD."version"+1 THEN RAISE EXCEPTION 'TVET certificate updates require a reasoned revocation'; END IF; RETURN NEW; END $$;
CREATE TRIGGER "TvetCertificate_immutable" BEFORE UPDATE ON "TvetCertificate" FOR EACH ROW EXECUTE FUNCTION "tvet_certificate_immutable"();
