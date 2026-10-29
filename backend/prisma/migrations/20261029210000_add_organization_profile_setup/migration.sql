BEGIN;
ALTER TABLE "Organization" ADD COLUMN "username" VARCHAR(30), ADD COLUMN "profileVersion" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "profileReadyAt" TIMESTAMP(3), ADD COLUMN "profilePhotoId" TEXT;
CREATE UNIQUE INDEX "Organization_username_key" ON "Organization"("username");
CREATE UNIQUE INDEX "Organization_profilePhotoId_key" ON "Organization"("profilePhotoId");
ALTER TABLE "Organization" ADD CONSTRAINT "organization_username_format" CHECK ("username" IS NULL OR "username" ~ '^[a-z][a-z0-9_]{2,29}$'), ADD CONSTRAINT "organization_profile_version" CHECK ("profileVersion" >= 0), ADD CONSTRAINT "organization_profile_ready" CHECK ("profileReadyAt" IS NULL OR ("username" IS NOT NULL AND "profilePhotoId" IS NOT NULL));
CREATE TABLE "OrganizationPhoto" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "storageKey" TEXT NOT NULL,
  "state" "PhotoState" NOT NULL DEFAULT 'UPLOADING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "byteSize" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "OrganizationPhoto_storageKey_key" ON "OrganizationPhoto"("storageKey");
CREATE INDEX "OrganizationPhoto_state_expiresAt_idx" ON "OrganizationPhoto"("state", "expiresAt");
CREATE INDEX "OrganizationPhoto_organizationId_createdAt_idx" ON "OrganizationPhoto"("organizationId", "createdAt");
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_profilePhotoId_fkey" FOREIGN KEY ("profilePhotoId") REFERENCES "OrganizationPhoto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
