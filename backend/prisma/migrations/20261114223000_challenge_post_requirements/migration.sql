ALTER TABLE "Opportunity" ADD COLUMN "postRequirements" JSONB NOT NULL DEFAULT '[]'::jsonb;
-- Keep historical maximum-applicant values solely for past records; no longer enforce or expose a cap.
UPDATE "Opportunity" SET "maxApplicants" = NULL WHERE "type" = 'CHALLENGE';
