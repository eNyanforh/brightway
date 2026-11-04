ALTER TABLE "Account" ADD COLUMN "accessVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Organization" ADD COLUMN "accessVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TYPE "ManagementCaseKind" AS ENUM ('SUPPORT', 'REPORT');
CREATE TYPE "ManagementCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'DISMISSED');
CREATE TYPE "ManagementCasePriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');
CREATE TABLE "ManagementAction" (
  "id" TEXT PRIMARY KEY, "actorId" TEXT NOT NULL REFERENCES "ManagementStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestKey" VARCHAR(36) NOT NULL, "requestHash" VARCHAR(64) NOT NULL, "action" VARCHAR(60) NOT NULL,
  "targetType" VARCHAR(30) NOT NULL, "targetId" TEXT NOT NULL, "reason" VARCHAR(1000) NOT NULL,
  "result" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ManagementAction_actorId_requestKey_key" ON "ManagementAction"("actorId", "requestKey");
CREATE INDEX "ManagementAction_createdAt_id_idx" ON "ManagementAction"("createdAt", "id");
CREATE INDEX "ManagementAction_targetType_targetId_createdAt_idx" ON "ManagementAction"("targetType", "targetId", "createdAt");
CREATE TABLE "ManagementCase" (
  "id" TEXT PRIMARY KEY, "kind" "ManagementCaseKind" NOT NULL, "subject" VARCHAR(160) NOT NULL,
  "status" "ManagementCaseStatus" NOT NULL DEFAULT 'OPEN', "priority" "ManagementCasePriority" NOT NULL DEFAULT 'NORMAL',
  "version" INTEGER NOT NULL DEFAULT 1, "creatorKey" TEXT NOT NULL, "idempotencyKey" VARCHAR(36) NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL, "creatorAccountId" TEXT REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdByStaffId" TEXT REFERENCES "ManagementStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "assignedStaffId" TEXT REFERENCES "ManagementStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "targetType" VARCHAR(30), "targetId" TEXT, "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManagementCase_creator_check" CHECK (("creatorAccountId" IS NOT NULL)::int + ("createdByStaffId" IS NOT NULL)::int = 1),
  CONSTRAINT "ManagementCase_target_check" CHECK (("targetType" IS NULL AND "targetId" IS NULL) OR ("targetType" IN ('ACCOUNT','ORGANIZATION') AND "targetId" IS NOT NULL))
);
CREATE UNIQUE INDEX "ManagementCase_creatorKey_idempotencyKey_key" ON "ManagementCase"("creatorKey", "idempotencyKey");
CREATE INDEX "ManagementCase_kind_status_createdAt_id_idx" ON "ManagementCase"("kind", "status", "createdAt", "id");
CREATE INDEX "ManagementCase_creatorAccountId_createdAt_id_idx" ON "ManagementCase"("creatorAccountId", "createdAt", "id");
CREATE INDEX "ManagementCase_assignedStaffId_status_idx" ON "ManagementCase"("assignedStaffId", "status");
CREATE TABLE "ManagementCaseMessage" (
  "id" TEXT PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "ManagementCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "authorKey" TEXT NOT NULL, "idempotencyKey" VARCHAR(36) NOT NULL,
  "authorAccountId" TEXT REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "authorStaffId" TEXT REFERENCES "ManagementStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "internal" BOOLEAN NOT NULL DEFAULT false, "body" VARCHAR(4000) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManagementCaseMessage_author_check" CHECK (("authorAccountId" IS NOT NULL)::int + ("authorStaffId" IS NOT NULL)::int = 1),
  CONSTRAINT "ManagementCaseMessage_internal_check" CHECK (NOT "internal" OR "authorStaffId" IS NOT NULL)
);
CREATE UNIQUE INDEX "ManagementCaseMessage_caseId_authorKey_idempotencyKey_key" ON "ManagementCaseMessage"("caseId", "authorKey", "idempotencyKey");
CREATE INDEX "ManagementCaseMessage_caseId_createdAt_id_idx" ON "ManagementCaseMessage"("caseId", "createdAt", "id");
