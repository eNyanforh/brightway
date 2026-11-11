-- CreateEnum
CREATE TYPE "OpportunityType" AS ENUM ('JOB', 'SCHOLARSHIP', 'CHALLENGE', 'EVENT');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED', 'CANCELLED', 'REMOVED');

-- CreateEnum
CREATE TYPE "OpportunityApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'SELECTED', 'NOT_SELECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "inputHash" VARCHAR(64) NOT NULL,
    "type" "OpportunityType" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(12000) NOT NULL,
    "location" VARCHAR(180) NOT NULL,
    "workMode" VARCHAR(16) NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "questions" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityApplication" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "status" "OpportunityApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "answers" JSONB NOT NULL,
    "profileSnapshot" JSONB,
    "opportunitySnapshot" JSONB,
    "feedback" VARCHAR(1000) NOT NULL DEFAULT '',
    "submittedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpportunityApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityApplicationFile" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" VARCHAR(64) NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityApplicationFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityApplicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromStatus" "OpportunityApplicationStatus",
    "toStatus" "OpportunityApplicationStatus" NOT NULL,
    "feedback" VARCHAR(1000) NOT NULL DEFAULT '',
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityUploadBudget" (
    "accountId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OpportunityUploadBudget_pkey" PRIMARY KEY ("accountId","day")
);

-- CreateIndex
CREATE INDEX "Opportunity_status_type_deadline_createdAt_id_idx" ON "Opportunity"("status", "type", "deadline", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Opportunity_organizationId_createdAt_id_idx" ON "Opportunity"("organizationId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_organizationId_authorId_requestKey_key" ON "Opportunity"("organizationId", "authorId", "requestKey");

-- CreateIndex
CREATE INDEX "OpportunityApplication_applicantId_createdAt_id_idx" ON "OpportunityApplication"("applicantId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "OpportunityApplication_opportunityId_status_createdAt_id_idx" ON "OpportunityApplication"("opportunityId", "status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityApplication_opportunityId_applicantId_key" ON "OpportunityApplication"("opportunityId", "applicantId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityApplicationFile_storageKey_key" ON "OpportunityApplicationFile"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityApplicationFile_applicationId_questionId_key" ON "OpportunityApplicationFile"("applicationId", "questionId");

-- CreateIndex
CREATE INDEX "OpportunityApplicationEvent_applicationId_createdAt_id_idx" ON "OpportunityApplicationEvent"("applicationId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityApplication" ADD CONSTRAINT "OpportunityApplication_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityApplication" ADD CONSTRAINT "OpportunityApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityApplicationFile" ADD CONSTRAINT "OpportunityApplicationFile_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "OpportunityApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityApplicationEvent" ADD CONSTRAINT "OpportunityApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "OpportunityApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityApplicationEvent" ADD CONSTRAINT "OpportunityApplicationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
