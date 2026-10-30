BEGIN;
ALTER TABLE "Organization" ADD COLUMN "profileSetupStep" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "phoneNumber" VARCHAR(16), ADD COLUMN "contactEmail" VARCHAR(254), ADD COLUMN "website" VARCHAR(2048);
-- Preserve organizations that already completed the previous setup.
UPDATE "Organization" SET "profileSetupStep" = CASE WHEN "profileReadyAt" IS NOT NULL THEN 5 WHEN "profilePhotoId" IS NOT NULL THEN 3 WHEN "username" IS NOT NULL THEN 2 ELSE 1 END;
ALTER TABLE "Organization" ADD CONSTRAINT "organization_setup_step" CHECK ("profileSetupStep" BETWEEN 1 AND 5), ADD CONSTRAINT "organization_setup_complete" CHECK ("profileReadyAt" IS NULL OR "profileSetupStep" = 5);
COMMIT;
