-- Member cover photographs are separate from identity-reviewed portrait photos.
ALTER TABLE "Profile" ADD COLUMN "coverPhotoId" TEXT;
CREATE UNIQUE INDEX "Profile_coverPhotoId_key" ON "Profile"("coverPhotoId");
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_coverPhotoId_fkey"
  FOREIGN KEY ("coverPhotoId") REFERENCES "PhotoAsset"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
