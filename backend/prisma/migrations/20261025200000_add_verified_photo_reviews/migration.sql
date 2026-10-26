BEGIN;

-- CreateEnum
CREATE TYPE "ProfilePhotoReviewState" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'DECLINED', 'SUPERSEDED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "photoReviewRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "latestPhotoReviewId" TEXT;

-- CreateTable
CREATE TABLE "ProfilePhotoReview" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "candidatePhotoId" TEXT NOT NULL,
    "previousPhotoId" TEXT,
    "identityAttemptId" TEXT,
    "baseIdentityHash" TEXT NOT NULL,
    "approvedIdentityHash" TEXT,
    "state" "ProfilePhotoReviewState" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewerId" TEXT,
    "note" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ProfilePhotoReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfilePhotoReviewAudit" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromState" "ProfilePhotoReviewState",
    "toState" "ProfilePhotoReviewState" NOT NULL,
    "note" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfilePhotoReviewAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProfilePhotoReview_candidatePhotoId_key" ON "ProfilePhotoReview"("candidatePhotoId");

-- CreateIndex
CREATE INDEX "ProfilePhotoReview_accountId_createdAt_id_idx" ON "ProfilePhotoReview"("accountId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ProfilePhotoReview_state_createdAt_id_idx" ON "ProfilePhotoReview"("state", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ProfilePhotoReviewAudit_reviewId_createdAt_id_idx" ON "ProfilePhotoReviewAudit"("reviewId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_latestPhotoReviewId_key" ON "Profile"("latestPhotoReviewId");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_latestPhotoReviewId_fkey" FOREIGN KEY ("latestPhotoReviewId") REFERENCES "ProfilePhotoReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfilePhotoReview" ADD CONSTRAINT "ProfilePhotoReview_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfilePhotoReview" ADD CONSTRAINT "ProfilePhotoReview_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfilePhotoReview" ADD CONSTRAINT "ProfilePhotoReview_candidatePhotoId_fkey" FOREIGN KEY ("candidatePhotoId") REFERENCES "PhotoAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfilePhotoReview" ADD CONSTRAINT "ProfilePhotoReview_previousPhotoId_fkey" FOREIGN KEY ("previousPhotoId") REFERENCES "PhotoAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfilePhotoReview" ADD CONSTRAINT "ProfilePhotoReview_identityAttemptId_fkey" FOREIGN KEY ("identityAttemptId") REFERENCES "ManualIdentityAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfilePhotoReview" ADD CONSTRAINT "ProfilePhotoReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfilePhotoReviewAudit" ADD CONSTRAINT "ProfilePhotoReviewAudit_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ProfilePhotoReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing identity approvals enable the gate, including approvals invalidated later.
UPDATE "Account" AS a SET "photoReviewRequired" = true
WHERE EXISTS (
  SELECT 1 FROM "ManualIdentityRequest" r
  JOIN "ManualIdentityAttempt" t ON t."requestId" = r.id
  WHERE r."accountId" = a.id AND t.state = 'APPROVED'
) OR EXISTS (
  SELECT 1 FROM "ManualIdentityAudit" e
  WHERE e."targetAccountId" = a.id AND e.action = 'DECIDED' AND e."toState" = 'APPROVED'
);

CREATE UNIQUE INDEX "ProfilePhotoReview_one_active_per_account"
ON "ProfilePhotoReview" ("accountId") WHERE state IN ('PENDING', 'IN_REVIEW');

ALTER TABLE "ProfilePhotoReview" ADD CONSTRAINT "ProfilePhotoReview_trust_requires_approval"
CHECK ("approvedIdentityHash" IS NULL OR (state = 'APPROVED' AND "identityAttemptId" IS NOT NULL));

COMMIT;
