-- Additional profile details are private by default. No previously saved profile
-- or published member profile automatically gains new public visibility.
ALTER TABLE "Profile"
  ADD COLUMN "profileCertificationsPublicEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "profileCredentialsPublicEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "profileAchievementsPublicEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "certifications" JSONB NOT NULL DEFAULT '[]'::jsonb;
