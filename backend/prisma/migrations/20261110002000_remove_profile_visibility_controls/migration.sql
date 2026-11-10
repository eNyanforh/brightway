-- Member profiles are visible to signed-in members without publication toggles.
-- Email, phone and WhatsApp contact visibility is unchanged.
DROP INDEX IF EXISTS "Profile_suggestion_skills_idx";
DROP INDEX IF EXISTS "Profile_suggestion_interests_idx";
DROP INDEX IF EXISTS "Profile_suggestion_career_idx";
ALTER TABLE "Profile"
  DROP COLUMN "profileViewSharingEnabled",
  DROP COLUMN "profileViewNotificationsEnabled",
  DROP COLUMN "profilePublicEnabled",
  DROP COLUMN "profileCertificationsPublicEnabled",
  DROP COLUMN "profileCredentialsPublicEnabled",
  DROP COLUMN "profileAchievementsPublicEnabled";
CREATE INDEX "Profile_suggestion_skills_idx" ON "Profile" USING GIN ("skills");
CREATE INDEX "Profile_suggestion_interests_idx" ON "Profile" USING GIN ("interests");
CREATE INDEX "Profile_suggestion_career_idx" ON "Profile" (lower("careerField")) WHERE "careerField" IS NOT NULL;
