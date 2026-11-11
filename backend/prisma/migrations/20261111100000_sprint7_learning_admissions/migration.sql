CREATE TYPE "ProgramStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "AdmissionCycleStatus" AS ENUM ('DRAFT', 'UPCOMING', 'OPEN', 'CLOSED', 'CANCELLED');
CREATE TYPE "AdmissionApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'NOT_ACCEPTED', 'WAITLISTED', 'WITHDRAWN');
CREATE TABLE "Program" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "authorId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestKey" TEXT NOT NULL,
  "inputHash" VARCHAR(64) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" VARCHAR(12000) NOT NULL,
  "type" VARCHAR(24) NOT NULL,
  "duration" VARCHAR(120) NOT NULL,
  "field" VARCHAR(120) NOT NULL,
  "studyMode" VARCHAR(16) NOT NULL,
  "countryCode" CHAR(2) NOT NULL,
  "location" VARCHAR(180) NOT NULL,
  "requirements" VARCHAR(6000) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "ProgramStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "Program_organizationId_authorId_requestKey_key" ON "Program"("organizationId", "authorId", "requestKey");
CREATE INDEX "Program_status_countryCode_studyMode_createdAt_id_idx" ON "Program"("status", "countryCode", "studyMode", "createdAt", "id");
CREATE INDEX "Program_organizationId_createdAt_id_idx" ON "Program"("organizationId", "createdAt", "id");
-- CreateTable
CREATE TABLE "AdmissionCycle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "inputHash" VARCHAR(64) NOT NULL,
    "programId" TEXT NOT NULL REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "questions" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "AdmissionCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmissionApplication" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "status" "AdmissionApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "answers" JSONB NOT NULL,
    "profileSnapshot" JSONB,
    "cycleSnapshot" JSONB,
    "feedback" VARCHAR(1000) NOT NULL DEFAULT '',
    "submittedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmissionApplicationFile" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" VARCHAR(64) NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdmissionApplicationFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmissionApplicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromStatus" "AdmissionApplicationStatus",
    "toStatus" "AdmissionApplicationStatus" NOT NULL,
    "feedback" VARCHAR(1000) NOT NULL DEFAULT '',
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdmissionApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmissionUploadBudget" (
    "accountId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdmissionUploadBudget_pkey" PRIMARY KEY ("accountId","day")
);

-- CreateIndex
CREATE INDEX "AdmissionCycle_status_opensAt_deadline_createdAt_id_idx" ON "AdmissionCycle"("status", "opensAt", "deadline", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AdmissionCycle_organizationId_createdAt_id_idx" ON "AdmissionCycle"("organizationId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionCycle_organizationId_authorId_requestKey_key" ON "AdmissionCycle"("organizationId", "authorId", "requestKey");

-- CreateIndex
CREATE INDEX "AdmissionApplication_applicantId_createdAt_id_idx" ON "AdmissionApplication"("applicantId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AdmissionApplication_cycleId_status_createdAt_id_idx" ON "AdmissionApplication"("cycleId", "status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionApplication_cycleId_applicantId_key" ON "AdmissionApplication"("cycleId", "applicantId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionApplicationFile_storageKey_key" ON "AdmissionApplicationFile"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionApplicationFile_applicationId_questionId_key" ON "AdmissionApplicationFile"("applicationId", "questionId");

-- CreateIndex
CREATE INDEX "AdmissionApplicationEvent_applicationId_createdAt_id_idx" ON "AdmissionApplicationEvent"("applicationId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "AdmissionCycle" ADD CONSTRAINT "AdmissionCycle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionCycle" ADD CONSTRAINT "AdmissionCycle_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AdmissionCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionApplicationFile" ADD CONSTRAINT "AdmissionApplicationFile_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "AdmissionApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionApplicationEvent" ADD CONSTRAINT "AdmissionApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "AdmissionApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionApplicationEvent" ADD CONSTRAINT "AdmissionApplicationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "AdmissionCycle_programId_createdAt_id_idx" ON "AdmissionCycle"("programId", "createdAt", "id");
ALTER TABLE "AdmissionCycle" ADD CONSTRAINT "AdmissionCycle_dates_check" CHECK ("opensAt" < "deadline");
