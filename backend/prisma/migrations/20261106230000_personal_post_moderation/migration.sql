BEGIN;

CREATE TYPE "MemberPostModerationStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED');

ALTER TABLE "MemberPost"
  ADD COLUMN "moderationStatus" "MemberPostModerationStatus" NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN "moderationFeedback" VARCHAR(1000);

ALTER TABLE "MemberPost" ALTER COLUMN "moderationStatus" SET DEFAULT 'PENDING';

CREATE INDEX "MemberPost_moderationStatus_withdrawnAt_createdAt_id_idx"
  ON "MemberPost"("moderationStatus", "withdrawnAt", "createdAt", "id");
DROP INDEX "MemberPost_withdrawnAt_createdAt_id_idx";

COMMIT;
