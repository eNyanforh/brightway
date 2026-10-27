BEGIN;
-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('SCHOOL', 'NGO', 'COMPANY');

-- CreateEnum
CREATE TYPE "OrganizationRequestStatus" AS ENUM ('SUBMITTED', 'ASSIGNED', 'RECOMMENDED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OrganizationRecommendation" AS ENUM ('APPROVE', 'REJECT');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OrganizationMembershipRole" AS ENUM ('PRIMARY_ADMIN');

-- CreateTable
CREATE TABLE "OrganizationOperator" (
    "accountId" TEXT NOT NULL,
    "agentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "approverEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationOperator_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "OrganizationOperatorAudit" (
    "id" TEXT NOT NULL,
    "targetAccountId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "capability" VARCHAR(30) NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationOperatorAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationRequest" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "inputHash" VARCHAR(64) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "representativeRole" VARCHAR(120) NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "region" VARCHAR(120) NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "offersTraining" BOOLEAN NOT NULL,
    "status" "OrganizationRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "assignedAgentId" TEXT,
    "decidedById" TEXT,
    "decisionReason" VARCHAR(2000),
    "decidedAt" TIMESTAMP(3),
    "targetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationFinding" (
    "requestId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "existenceConfirmed" BOOLEAN NOT NULL,
    "locationConfirmed" BOOLEAN NOT NULL,
    "authorityConfirmed" BOOLEAN NOT NULL,
    "typeConfirmed" BOOLEAN NOT NULL,
    "operationalConfirmed" BOOLEAN NOT NULL,
    "recommendation" "OrganizationRecommendation" NOT NULL,
    "notes" VARCHAR(4000) NOT NULL,
    "setupAssistance" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationFinding_pkey" PRIMARY KEY ("requestId")
);

-- CreateTable
CREATE TABLE "OrganizationRequestAudit" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "fromStatus" "OrganizationRequestStatus",
    "toStatus" "OrganizationRequestStatus" NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationRequestAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "offersTraining" BOOLEAN NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationOperatingLocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "region" VARCHAR(120) NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationOperatingLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "role" "OrganizationMembershipRole" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationOperatorAudit_targetAccountId_createdAt_idx" ON "OrganizationOperatorAudit"("targetAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "OrganizationRequest_applicantId_createdAt_id_idx" ON "OrganizationRequest"("applicantId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "OrganizationRequest_status_createdAt_id_idx" ON "OrganizationRequest"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "OrganizationRequest_assignedAgentId_status_createdAt_idx" ON "OrganizationRequest"("assignedAgentId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationRequest_applicantId_idempotencyKey_key" ON "OrganizationRequest"("applicantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "OrganizationRequestAudit_requestId_createdAt_id_idx" ON "OrganizationRequestAudit"("requestId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_requestId_key" ON "Organization"("requestId");

-- CreateIndex
CREATE INDEX "OrganizationOperatingLocation_organizationId_idx" ON "OrganizationOperatingLocation"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationMembership_accountId_enabled_idx" ON "OrganizationMembership"("accountId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_accountId_key" ON "OrganizationMembership"("organizationId", "accountId");

-- AddForeignKey
ALTER TABLE "OrganizationOperator" ADD CONSTRAINT "OrganizationOperator_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationOperatorAudit" ADD CONSTRAINT "OrganizationOperatorAudit_targetAccountId_fkey" FOREIGN KEY ("targetAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationRequest" ADD CONSTRAINT "OrganizationRequest_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationRequest" ADD CONSTRAINT "OrganizationRequest_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationRequest" ADD CONSTRAINT "OrganizationRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationFinding" ADD CONSTRAINT "OrganizationFinding_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OrganizationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationFinding" ADD CONSTRAINT "OrganizationFinding_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationRequestAudit" ADD CONSTRAINT "OrganizationRequestAudit_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OrganizationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OrganizationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationOperatingLocation" ADD CONSTRAINT "OrganizationOperatingLocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A request is not a public organization. Active same-owner duplicates are bounded at the DB layer.
CREATE UNIQUE INDEX "OrganizationRequest_one_active_fingerprint" ON "OrganizationRequest" ("applicantId", "fingerprint") WHERE "status" IN ('SUBMITTED', 'ASSIGNED', 'RECOMMENDED');
ALTER TABLE "OrganizationRequest" ADD CONSTRAINT "organization_request_no_self_assignment" CHECK ("assignedAgentId" IS NULL OR "assignedAgentId" <> "applicantId");
ALTER TABLE "OrganizationRequest" ADD CONSTRAINT "organization_request_separate_decision_actor" CHECK ("decidedById" IS NULL OR ("decidedById" <> "applicantId" AND "decidedById" <> "assignedAgentId"));
ALTER TABLE "OrganizationRequest" ADD CONSTRAINT "organization_request_assignment_required" CHECK ("status" = 'SUBMITTED' OR "assignedAgentId" IS NOT NULL);
ALTER TABLE "OrganizationRequest" ADD CONSTRAINT "organization_request_positive_version" CHECK ("version" > 0);
ALTER TABLE "OrganizationFinding" ADD CONSTRAINT "organization_positive_recommendation_complete" CHECK ("recommendation" <> 'APPROVE' OR ("existenceConfirmed" AND "locationConfirmed" AND "authorityConfirmed" AND "typeConfirmed" AND "operationalConfirmed"));
CREATE UNIQUE INDEX "OrganizationMembership_one_primary_admin" ON "OrganizationMembership" ("organizationId") WHERE "role" = 'PRIMARY_ADMIN' AND "enabled" = true;

COMMIT;
