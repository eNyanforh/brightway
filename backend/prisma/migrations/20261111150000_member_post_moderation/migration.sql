-- New personal submissions and edits enter human review. Existing publications
-- remain published so this migration does not remove historical content.
CREATE TYPE "MemberPostModerationStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED');
CREATE TYPE "MemberPostScreenStatus" AS ENUM ('NOT_CONFIGURED', 'CLEAR', 'FLAGGED', 'UNAVAILABLE');

ALTER TABLE "MemberPost"
  ADD COLUMN "moderationStatus" "MemberPostModerationStatus" NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN "moderationVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "moderationFeedback" VARCHAR(1000),
  ADD COLUMN "moderationScreenStatus" "MemberPostScreenStatus",
  ADD COLUMN "moderationFlags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- The default affects all future new posts; existing posts stay published.
ALTER TABLE "MemberPost" ALTER COLUMN "moderationStatus" SET DEFAULT 'PENDING';
CREATE INDEX "MemberPost_moderationStatus_withdrawnAt_createdAt_id_idx"
  ON "MemberPost" ("moderationStatus", "withdrawnAt", "createdAt", "id");
