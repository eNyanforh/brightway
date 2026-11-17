-- Optional structured employment and compensation details for job listings.
-- Existing listings remain valid; missing details are not inferred.
ALTER TABLE "Opportunity" ADD COLUMN "jobDetails" JSONB;
