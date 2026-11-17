-- Existing listings receive an empty details object; new jobs can store employment and salary terms.
ALTER TABLE "Opportunity" ADD COLUMN "jobDetails" JSONB NOT NULL DEFAULT '{}'::jsonb;
