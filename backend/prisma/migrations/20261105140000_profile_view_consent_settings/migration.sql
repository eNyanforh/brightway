ALTER TABLE "Profile"
  ADD COLUMN "profileViewSharingEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "profileViewNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;
