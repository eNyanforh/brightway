BEGIN;

-- Retain the uploaded image instead of creating an empty replacement column.
ALTER TABLE "Profile" RENAME COLUMN "pendingPhotoId" TO "photoId";
ALTER TABLE "Profile" RENAME CONSTRAINT "Profile_pendingPhotoId_fkey" TO "Profile_photoId_fkey";
ALTER INDEX "Profile_pendingPhotoId_key" RENAME TO "Profile_photoId_key";

-- The newest uploaded photo wins; fall back to the previous approved photo.
-- Increment versions so cached clients refetch after the policy change.
UPDATE "Profile"
SET "photoId" = COALESCE("photoId", "approvedPhotoId"),
    "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE COALESCE("photoId", "approvedPhotoId") IS NOT NULL;

ALTER TABLE "Profile" DROP CONSTRAINT "Profile_approvedPhotoId_fkey";
DROP INDEX "Profile_approvedPhotoId_key";
ALTER TABLE "Profile" DROP COLUMN "approvedPhotoId";
ALTER TABLE "PhotoAsset" DROP COLUMN "reviewStatus";
DROP TYPE "PhotoReviewStatus";

-- Preserve objects still in use. Unreferenced old photos are queued for the
-- existing cleanup job; this migration itself makes no R2 request.
UPDATE "PhotoAsset" AS a
SET "state" = 'DELETE_PENDING', "updatedAt" = CURRENT_TIMESTAMP
WHERE a."state" = 'CLAIMED'
  AND NOT EXISTS (SELECT 1 FROM "Profile" AS p WHERE p."photoId" = a."id");

COMMIT;