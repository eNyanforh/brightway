BEGIN;

-- CreateEnum
CREATE TYPE "IdentityNameChangeState" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'APPROVED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "latestNameChangeId" TEXT;

-- AlterTable
ALTER TABLE "ManualIdentityEvidence" ADD COLUMN     "nameChangeId" TEXT;

-- CreateTable
CREATE TABLE "IdentityNameChange" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "identityAttemptId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "baseIdentityHash" TEXT NOT NULL,
    "approvedIdentityHash" TEXT,
    "previousName" JSONB,
    "proposedName" JSONB,
    "reason" VARCHAR(1000),
    "state" "IdentityNameChangeState" NOT NULL DEFAULT 'SUBMITTED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewerId" TEXT,
    "note" VARCHAR(2000),
    "consentVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "targetAt" TIMESTAMP(3) NOT NULL,
    "calendarVersion" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "purgeAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "IdentityNameChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityNameChangeAudit" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromState" "IdentityNameChangeState",
    "toState" "IdentityNameChangeState" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityNameChangeAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdentityNameChange_state_createdAt_id_idx" ON "IdentityNameChange"("state", "createdAt", "id");

-- CreateIndex
CREATE INDEX "IdentityNameChange_accountId_createdAt_id_idx" ON "IdentityNameChange"("accountId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "IdentityNameChange_purgeAt_purgedAt_idx" ON "IdentityNameChange"("purgeAt", "purgedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityNameChange_accountId_idempotencyKey_key" ON "IdentityNameChange"("accountId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "IdentityNameChangeAudit_requestId_createdAt_id_idx" ON "IdentityNameChangeAudit"("requestId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Account_latestNameChangeId_key" ON "Account"("latestNameChangeId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_latestNameChangeId_fkey" FOREIGN KEY ("latestNameChangeId") REFERENCES "IdentityNameChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualIdentityEvidence" ADD CONSTRAINT "ManualIdentityEvidence_nameChangeId_fkey" FOREIGN KEY ("nameChangeId") REFERENCES "IdentityNameChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityNameChange" ADD CONSTRAINT "IdentityNameChange_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityNameChange" ADD CONSTRAINT "IdentityNameChange_identityAttemptId_fkey" FOREIGN KEY ("identityAttemptId") REFERENCES "ManualIdentityAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityNameChange" ADD CONSTRAINT "IdentityNameChange_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityNameChangeAudit" ADD CONSTRAINT "IdentityNameChangeAudit_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "IdentityNameChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE UNIQUE INDEX "IdentityNameChange_one_active_per_account" ON "IdentityNameChange" ("accountId") WHERE state IN ('SUBMITTED', 'IN_REVIEW');

ALTER TABLE "IdentityNameChange" ADD CONSTRAINT "IdentityNameChange_proof_requires_approval" CHECK ("approvedIdentityHash" IS NULL OR state = 'APPROVED');

ALTER TABLE "ManualIdentityEvidence" ADD CONSTRAINT "ManualIdentityEvidence_one_purpose" CHECK ("attemptId" IS NULL OR "nameChangeId" IS NULL);

CREATE INDEX "ManualIdentityEvidence_nameChangeId_state_idx" ON "ManualIdentityEvidence" ("nameChangeId", state);

COMMIT;
