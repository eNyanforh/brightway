-- CreateEnum
CREATE TYPE "ManualIdentityStatus" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'APPROVED', 'DECLINED', 'ACTION_REQUIRED', 'INVALIDATED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "identityRevision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "identityRevision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "identityRevision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ManualIdentityEvidence" ADD COLUMN     "attemptId" TEXT;

-- CreateTable
CREATE TABLE "ManualIdentityRequest" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "state" "ManualIdentityStatus" NOT NULL DEFAULT 'SUBMITTED',
    "currentAttemptId" TEXT NOT NULL,
    "initialSubmittedAt" TIMESTAMP(3) NOT NULL,
    "targetAt" TIMESTAMP(3) NOT NULL,
    "calendarVersion" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "submissionCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualIdentityRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualIdentityAttempt" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "state" "ManualIdentityStatus" NOT NULL DEFAULT 'SUBMITTED',
    "idempotencyKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "identityHash" TEXT NOT NULL,
    "profileVersion" INTEGER NOT NULL,
    "snapshot" JSONB,
    "educationRecordId" TEXT NOT NULL,
    "educationRevision" INTEGER NOT NULL,
    "experienceRecordId" TEXT NOT NULL,
    "experienceRevision" INTEGER NOT NULL,
    "reviewerId" TEXT,
    "note" VARCHAR(2000),
    "consentVersion" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "purgeAt" TIMESTAMP(3) NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "targetAt" TIMESTAMP(3) NOT NULL,
    "calendarVersion" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "ManualIdentityAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualIdentityReviewer" (
    "accountId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualIdentityReviewer_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "ManualIdentityAudit" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "targetAccountId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "attemptId" TEXT,
    "fromState" "ManualIdentityStatus",
    "toState" "ManualIdentityStatus",
    "note" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualIdentityAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManualIdentityRequest_accountId_key" ON "ManualIdentityRequest"("accountId");

-- CreateIndex
CREATE INDEX "ManualIdentityRequest_state_initialSubmittedAt_id_idx" ON "ManualIdentityRequest"("state", "initialSubmittedAt", "id");

-- CreateIndex
CREATE INDEX "ManualIdentityAttempt_purgeAt_purgedAt_idx" ON "ManualIdentityAttempt"("purgeAt", "purgedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ManualIdentityAttempt_requestId_idempotencyKey_key" ON "ManualIdentityAttempt"("requestId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ManualIdentityAttempt_requestId_revision_key" ON "ManualIdentityAttempt"("requestId", "revision");

-- CreateIndex
CREATE INDEX "ManualIdentityAudit_requestId_createdAt_id_idx" ON "ManualIdentityAudit"("requestId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ManualIdentityAudit_targetAccountId_createdAt_idx" ON "ManualIdentityAudit"("targetAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "ManualIdentityEvidence_attemptId_state_idx" ON "ManualIdentityEvidence"("attemptId", "state");

-- AddForeignKey
ALTER TABLE "ManualIdentityEvidence" ADD CONSTRAINT "ManualIdentityEvidence_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ManualIdentityAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualIdentityRequest" ADD CONSTRAINT "ManualIdentityRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualIdentityAttempt" ADD CONSTRAINT "ManualIdentityAttempt_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ManualIdentityRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualIdentityReviewer" ADD CONSTRAINT "ManualIdentityReviewer_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualIdentityAudit" ADD CONSTRAINT "ManualIdentityAudit_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ManualIdentityRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Monotonic protected-field revisions prevent reverting changed values from
-- resurrecting an old identity approval. Ordinary biography/contact edits do
-- not invalidate identity; profile completeness is still checked at read time.
CREATE FUNCTION "brightway_identity_revision"() RETURNS TRIGGER AS $$
DECLARE changed BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'Person' THEN
    changed := ROW(NEW."firstName", NEW."middleName", NEW."lastName", NEW."birthDate", NEW."gender")
      IS DISTINCT FROM ROW(OLD."firstName", OLD."middleName", OLD."lastName", OLD."birthDate", OLD."gender");
  ELSIF TG_TABLE_NAME = 'Account' THEN
    changed := NEW."email" IS DISTINCT FROM OLD."email";
  ELSIF TG_TABLE_NAME = 'Profile' THEN
    changed := ROW(NEW."photoId", NEW."countryCode") IS DISTINCT FROM ROW(OLD."photoId", OLD."countryCode");
  ELSE
    RAISE EXCEPTION 'Unexpected identity revision table';
  END IF;
  NEW."identityRevision" := OLD."identityRevision" + CASE WHEN changed THEN 1 ELSE 0 END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Person_identity_revision" BEFORE UPDATE ON "Person"
  FOR EACH ROW EXECUTE FUNCTION "brightway_identity_revision"();
CREATE TRIGGER "Account_identity_revision" BEFORE UPDATE ON "Account"
  FOR EACH ROW EXECUTE FUNCTION "brightway_identity_revision"();
CREATE TRIGGER "Profile_identity_revision" BEFORE UPDATE ON "Profile"
  FOR EACH ROW EXECUTE FUNCTION "brightway_identity_revision"();
