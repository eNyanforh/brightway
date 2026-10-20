-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('MEMBER', 'CREDENTIAL_REVIEWER');

-- CreateEnum
CREATE TYPE "CredentialKind" AS ENUM ('education', 'experience');

-- CreateEnum
CREATE TYPE "EvidenceState" AS ENUM ('UPLOADING', 'READY', 'ATTACHED', 'DELETE_PENDING', 'DELETED');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "platformRole" "PlatformRole" NOT NULL DEFAULT 'MEMBER';

-- CreateTable
CREATE TABLE "CredentialReview" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" "CredentialKind" NOT NULL,
    "recordId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "CredentialStatus" NOT NULL DEFAULT 'SUBMITTED',
    "initialSubmittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewerId" TEXT,
    "note" VARCHAR(2000),

    CONSTRAINT "CredentialReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialAttempt" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" "CredentialStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewerId" TEXT,
    "note" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "CredentialAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialEvidence" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" "CredentialKind" NOT NULL,
    "recordId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "state" "EvidenceState" NOT NULL DEFAULT 'UPLOADING',
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptId" TEXT,

    CONSTRAINT "CredentialEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialUploadBudget" (
    "personId" TEXT NOT NULL,
    "hour" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CredentialUploadBudget_pkey" PRIMARY KEY ("personId","hour")
);

-- CreateTable
CREATE TABLE "CredentialAuditEvent" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "fromStatus" "CredentialStatus" NOT NULL,
    "toStatus" "CredentialStatus" NOT NULL,
    "note" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredentialAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewerRoleAudit" (
    "id" TEXT NOT NULL,
    "targetAccountId" TEXT NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'SERVER_OPERATOR_CLI',
    "fromRole" "PlatformRole" NOT NULL,
    "toRole" "PlatformRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewerRoleAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CredentialReview_status_initialSubmittedAt_id_idx" ON "CredentialReview"("status", "initialSubmittedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CredentialReview_kind_recordId_key" ON "CredentialReview"("kind", "recordId");

-- CreateIndex
CREATE INDEX "CredentialAttempt_reviewId_createdAt_id_idx" ON "CredentialAttempt"("reviewId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CredentialEvidence_storageKey_key" ON "CredentialEvidence"("storageKey");

-- CreateIndex
CREATE INDEX "CredentialEvidence_personId_recordId_revision_state_idx" ON "CredentialEvidence"("personId", "recordId", "revision", "state");

-- CreateIndex
CREATE INDEX "CredentialEvidence_state_expiresAt_idx" ON "CredentialEvidence"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "CredentialAuditEvent_reviewId_createdAt_id_idx" ON "CredentialAuditEvent"("reviewId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "CredentialReview" ADD CONSTRAINT "CredentialReview_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialAttempt" ADD CONSTRAINT "CredentialAttempt_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "CredentialReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialEvidence" ADD CONSTRAINT "CredentialEvidence_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "CredentialAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialAuditEvent" ADD CONSTRAINT "CredentialAuditEvent_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "CredentialReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

