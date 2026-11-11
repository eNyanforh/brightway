-- CreateEnum
CREATE TYPE "SchoolStudentStatus" AS ENUM ('PRE_REGISTERED', 'ACTIVE', 'SUSPENDED', 'FORMER');

-- CreateEnum
CREATE TYPE "SchoolSubmissionStatus" AS ENUM ('DRAFT', 'FINAL');

-- CreateEnum
CREATE TYPE "SchoolAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "SchoolGuardianStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REVOKED');

-- CreateEnum
CREATE TYPE "SchoolSubjectMode" AS ENUM ('COMPULSORY', 'ELECTIVE');

-- CreateTable
CREATE TABLE "GradeSchoolSubject" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "passingMark" DOUBLE PRECISION NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GradeSchoolSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeSchoolClass" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "GradeSchoolClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeSchoolSection" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "GradeSchoolSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeSchoolYear" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,

    CONSTRAINT "GradeSchoolYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeSchoolPeriod" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,

    CONSTRAINT "GradeSchoolPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeSchoolOffering" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "mode" "SchoolSubjectMode" NOT NULL DEFAULT 'COMPULSORY',
    "teacherId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GradeSchoolOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeSchoolStudent" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "SchoolStudentStatus" NOT NULL DEFAULT 'PRE_REGISTERED',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GradeSchoolStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeSchoolRegistration" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "admissionId" TEXT,
    "source" VARCHAR(12) NOT NULL,
    "status" "SchoolStudentStatus" NOT NULL DEFAULT 'PRE_REGISTERED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "GradeSchoolRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeSchoolElective" (
    "campusId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,

    CONSTRAINT "GradeSchoolElective_pkey" PRIMARY KEY ("registrationId","offeringId")
);

-- CreateTable
CREATE TABLE "GradeSchoolGuardian" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "relationship" VARCHAR(60) NOT NULL,
    "status" "SchoolGuardianStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "GradeSchoolGuardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeSchoolSchedule" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startsAt" INTEGER NOT NULL,
    "endsAt" INTEGER NOT NULL,
    "room" VARCHAR(100) NOT NULL,

    CONSTRAINT "GradeSchoolSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeSchoolAttendance" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "heldOn" DATE NOT NULL,
    "startsAt" INTEGER NOT NULL DEFAULT 0,
    "status" "SchoolSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "GradeSchoolAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeSchoolAttendanceRecord" (
    "campusId" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "status" "SchoolAttendanceStatus" NOT NULL,

    CONSTRAINT "GradeSchoolAttendanceRecord_pkey" PRIMARY KEY ("attendanceId","registrationId")
);

-- CreateTable
CREATE TABLE "GradeSchoolAssessment" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "heldOn" DATE NOT NULL,
    "status" "SchoolSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "GradeSchoolAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeSchoolScore" (
    "campusId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "GradeSchoolScore_pkey" PRIMARY KEY ("assessmentId","registrationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolSubject_campusId_id_key" ON "GradeSchoolSubject"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolSubject_campusId_name_key" ON "GradeSchoolSubject"("campusId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolClass_campusId_id_key" ON "GradeSchoolClass"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolClass_campusId_name_key" ON "GradeSchoolClass"("campusId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolSection_campusId_id_key" ON "GradeSchoolSection"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolSection_campusId_classId_name_key" ON "GradeSchoolSection"("campusId", "classId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolYear_campusId_id_key" ON "GradeSchoolYear"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolYear_campusId_name_key" ON "GradeSchoolYear"("campusId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolPeriod_campusId_id_key" ON "GradeSchoolPeriod"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolPeriod_campusId_yearId_name_key" ON "GradeSchoolPeriod"("campusId", "yearId", "name");

-- CreateIndex
CREATE INDEX "GradeSchoolOffering_teacherId_campusId_periodId_idx" ON "GradeSchoolOffering"("teacherId", "campusId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolOffering_campusId_periodId_sectionId_subjectId_key" ON "GradeSchoolOffering"("campusId", "periodId", "sectionId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolOffering_campusId_id_key" ON "GradeSchoolOffering"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolStudent_campusId_accountId_key" ON "GradeSchoolStudent"("campusId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolStudent_campusId_id_key" ON "GradeSchoolStudent"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolRegistration_admissionId_key" ON "GradeSchoolRegistration"("admissionId");

-- CreateIndex
CREATE INDEX "GradeSchoolRegistration_campusId_periodId_sectionId_status__idx" ON "GradeSchoolRegistration"("campusId", "periodId", "sectionId", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolRegistration_campusId_studentId_periodId_key" ON "GradeSchoolRegistration"("campusId", "studentId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolRegistration_campusId_id_key" ON "GradeSchoolRegistration"("campusId", "id");

-- CreateIndex
CREATE INDEX "GradeSchoolGuardian_guardianId_status_idx" ON "GradeSchoolGuardian"("guardianId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolGuardian_studentId_guardianId_key" ON "GradeSchoolGuardian"("studentId", "guardianId");

-- CreateIndex
CREATE INDEX "GradeSchoolSchedule_campusId_weekday_idx" ON "GradeSchoolSchedule"("campusId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolSchedule_offeringId_weekday_startsAt_key" ON "GradeSchoolSchedule"("offeringId", "weekday", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolAttendance_campusId_id_key" ON "GradeSchoolAttendance"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolAttendance_offeringId_heldOn_startsAt_key" ON "GradeSchoolAttendance"("offeringId", "heldOn", "startsAt");

-- CreateIndex
CREATE INDEX "GradeSchoolAttendanceRecord_registrationId_idx" ON "GradeSchoolAttendanceRecord"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolAssessment_campusId_id_key" ON "GradeSchoolAssessment"("campusId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSchoolAssessment_offeringId_title_key" ON "GradeSchoolAssessment"("offeringId", "title");

-- CreateIndex
CREATE INDEX "GradeSchoolScore_registrationId_idx" ON "GradeSchoolScore"("registrationId");

-- AddForeignKey
ALTER TABLE "GradeSchoolSubject" ADD CONSTRAINT "GradeSchoolSubject_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "VirtualCampus"("organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolClass" ADD CONSTRAINT "GradeSchoolClass_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "VirtualCampus"("organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolSection" ADD CONSTRAINT "GradeSchoolSection_campusId_classId_fkey" FOREIGN KEY ("campusId", "classId") REFERENCES "GradeSchoolClass"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolYear" ADD CONSTRAINT "GradeSchoolYear_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "VirtualCampus"("organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolPeriod" ADD CONSTRAINT "GradeSchoolPeriod_campusId_yearId_fkey" FOREIGN KEY ("campusId", "yearId") REFERENCES "GradeSchoolYear"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolOffering" ADD CONSTRAINT "GradeSchoolOffering_campusId_periodId_fkey" FOREIGN KEY ("campusId", "periodId") REFERENCES "GradeSchoolPeriod"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolOffering" ADD CONSTRAINT "GradeSchoolOffering_campusId_sectionId_fkey" FOREIGN KEY ("campusId", "sectionId") REFERENCES "GradeSchoolSection"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolOffering" ADD CONSTRAINT "GradeSchoolOffering_campusId_subjectId_fkey" FOREIGN KEY ("campusId", "subjectId") REFERENCES "GradeSchoolSubject"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolOffering" ADD CONSTRAINT "GradeSchoolOffering_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolStudent" ADD CONSTRAINT "GradeSchoolStudent_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "VirtualCampus"("organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolStudent" ADD CONSTRAINT "GradeSchoolStudent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolRegistration" ADD CONSTRAINT "GradeSchoolRegistration_campusId_studentId_fkey" FOREIGN KEY ("campusId", "studentId") REFERENCES "GradeSchoolStudent"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolRegistration" ADD CONSTRAINT "GradeSchoolRegistration_campusId_periodId_fkey" FOREIGN KEY ("campusId", "periodId") REFERENCES "GradeSchoolPeriod"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolRegistration" ADD CONSTRAINT "GradeSchoolRegistration_campusId_sectionId_fkey" FOREIGN KEY ("campusId", "sectionId") REFERENCES "GradeSchoolSection"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolRegistration" ADD CONSTRAINT "GradeSchoolRegistration_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "AdmissionApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolElective" ADD CONSTRAINT "GradeSchoolElective_campusId_registrationId_fkey" FOREIGN KEY ("campusId", "registrationId") REFERENCES "GradeSchoolRegistration"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolElective" ADD CONSTRAINT "GradeSchoolElective_campusId_offeringId_fkey" FOREIGN KEY ("campusId", "offeringId") REFERENCES "GradeSchoolOffering"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolGuardian" ADD CONSTRAINT "GradeSchoolGuardian_campusId_studentId_fkey" FOREIGN KEY ("campusId", "studentId") REFERENCES "GradeSchoolStudent"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolGuardian" ADD CONSTRAINT "GradeSchoolGuardian_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolSchedule" ADD CONSTRAINT "GradeSchoolSchedule_campusId_offeringId_fkey" FOREIGN KEY ("campusId", "offeringId") REFERENCES "GradeSchoolOffering"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolAttendance" ADD CONSTRAINT "GradeSchoolAttendance_campusId_offeringId_fkey" FOREIGN KEY ("campusId", "offeringId") REFERENCES "GradeSchoolOffering"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolAttendanceRecord" ADD CONSTRAINT "GradeSchoolAttendanceRecord_campusId_attendanceId_fkey" FOREIGN KEY ("campusId", "attendanceId") REFERENCES "GradeSchoolAttendance"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolAttendanceRecord" ADD CONSTRAINT "GradeSchoolAttendanceRecord_campusId_registrationId_fkey" FOREIGN KEY ("campusId", "registrationId") REFERENCES "GradeSchoolRegistration"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolAssessment" ADD CONSTRAINT "GradeSchoolAssessment_campusId_offeringId_fkey" FOREIGN KEY ("campusId", "offeringId") REFERENCES "GradeSchoolOffering"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolScore" ADD CONSTRAINT "GradeSchoolScore_campusId_assessmentId_fkey" FOREIGN KEY ("campusId", "assessmentId") REFERENCES "GradeSchoolAssessment"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSchoolScore" ADD CONSTRAINT "GradeSchoolScore_campusId_registrationId_fkey" FOREIGN KEY ("campusId", "registrationId") REFERENCES "GradeSchoolRegistration"("campusId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Bound academic values independently of HTTP validation. Composite foreign keys
-- above prevent a record from referencing another school's academic structure.
ALTER TABLE "GradeSchoolSubject" ADD CONSTRAINT "school_passing_mark" CHECK ("passingMark" >= 0 AND "passingMark" <= 100);
ALTER TABLE "GradeSchoolSection" ADD CONSTRAINT "school_capacity" CHECK ("capacity" BETWEEN 1 AND 500);
ALTER TABLE "GradeSchoolYear" ADD CONSTRAINT "school_year_duration" CHECK ("endsOn" > ("startsOn" + interval '4 months'));
ALTER TABLE "GradeSchoolPeriod" ADD CONSTRAINT "school_period_dates" CHECK ("endsOn" > "startsOn" AND "kind" IN ('TERM','SEMESTER'));
ALTER TABLE "GradeSchoolSchedule" ADD CONSTRAINT "school_lesson_times" CHECK ("weekday" BETWEEN 1 AND 7 AND "startsAt" >= 0 AND "endsAt" <= 1440 AND "endsAt" > "startsAt");
ALTER TABLE "GradeSchoolAssessment" ADD CONSTRAINT "school_assessment_values" CHECK ("maxScore" > 0 AND "maxScore" <= 100000 AND "weight" > 0 AND "weight" <= 100);
ALTER TABLE "GradeSchoolScore" ADD CONSTRAINT "school_score_nonnegative" CHECK ("score" >= 0 AND "score" <= 100000);
ALTER TABLE "GradeSchoolRegistration" ADD CONSTRAINT "school_registration_source" CHECK ("source" IN ('DIRECT','ADMISSION','RETURNING') AND (("source" = 'ADMISSION') = ("admissionId" IS NOT NULL)));
ALTER TABLE "GradeSchoolAttendance" ADD CONSTRAINT "school_attendance_final" CHECK (("status" = 'FINAL') = ("finalizedAt" IS NOT NULL));
ALTER TABLE "GradeSchoolAssessment" ADD CONSTRAINT "school_assessment_final" CHECK (("status" = 'FINAL') = ("finalizedAt" IS NOT NULL));
ALTER TABLE "GradeSchoolGuardian" ADD CONSTRAINT "school_guardian_confirmation" CHECK (("status" = 'CONFIRMED') = ("confirmedAt" IS NOT NULL));

ALTER TABLE "GradeSchoolAttendance" ADD CONSTRAINT "school_attendance_time" CHECK ("startsAt" BETWEEN 0 AND 1439);

-- Preserve the privacy of all previously published staff announcements.
ALTER TABLE "CampusAnnouncement" ADD COLUMN "audience" VARCHAR(16) NOT NULL DEFAULT 'STAFF';
ALTER TABLE "CampusAnnouncement" ADD CONSTRAINT "campus_announcement_audience" CHECK ("audience" IN ('STAFF','CAMPUS'));
