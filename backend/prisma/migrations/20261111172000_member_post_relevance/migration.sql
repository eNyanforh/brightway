-- Keep existing publication and review states unchanged. Newly screened content
-- records a separate, bounded educational/career relevance assessment.
CREATE TYPE "MemberPostRelevanceStatus" AS ENUM
  ('NOT_CONFIGURED', 'RELEVANT', 'UNCERTAIN', 'OFF_TOPIC', 'UNAVAILABLE');

ALTER TABLE "MemberPost"
  ADD COLUMN "moderationRelevanceStatus" "MemberPostRelevanceStatus",
  ADD COLUMN "moderationRelevanceCategory" VARCHAR(20),
  ADD COLUMN "moderationRelevanceReason" VARCHAR(240);
