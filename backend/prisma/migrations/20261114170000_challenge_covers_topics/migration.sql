-- Photographic covers are curated first-party BrightWay assets; all existing
-- opportunities retain a valid local default. Categories are optional to
-- preserve previously published Challenge records.
ALTER TABLE "Opportunity"
  ADD COLUMN "topics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "coverImage" VARCHAR(20) NOT NULL DEFAULT 'STUDENTS';
