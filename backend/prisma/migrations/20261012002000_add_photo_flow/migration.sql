-- CreateEnum
CREATE TYPE "PhotoState" AS ENUM ('UPLOADING', 'READY', 'CLAIMED', 'DELETE_PENDING', 'DELETED');

-- CreateEnum
CREATE TYPE "PhotoReviewStatus" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'APPROVED', 'ACTION_REQUIRED', 'REJECTED');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "approvedPhotoId" TEXT,
ADD COLUMN     "pendingPhotoId" TEXT;

-- CreateTable
CREATE TABLE "SignupDraft" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SignupDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoAsset" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "state" "PhotoState" NOT NULL DEFAULT 'UPLOADING',
    "reviewStatus" "PhotoReviewStatus",
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "byteSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "draftId" TEXT,
    "personId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhotoAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignupDraft_tokenHash_key" ON "SignupDraft"("tokenHash");

-- CreateIndex
CREATE INDEX "SignupDraft_expiresAt_idx" ON "SignupDraft"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoAsset_storageKey_key" ON "PhotoAsset"("storageKey");

-- CreateIndex
CREATE INDEX "PhotoAsset_state_expiresAt_idx" ON "PhotoAsset"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "PhotoAsset_personId_idx" ON "PhotoAsset"("personId");

-- CreateIndex
CREATE INDEX "PhotoAsset_draftId_idx" ON "PhotoAsset"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_pendingPhotoId_key" ON "Profile"("pendingPhotoId");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_approvedPhotoId_key" ON "Profile"("approvedPhotoId");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_pendingPhotoId_fkey" FOREIGN KEY ("pendingPhotoId") REFERENCES "PhotoAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_approvedPhotoId_fkey" FOREIGN KEY ("approvedPhotoId") REFERENCES "PhotoAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoAsset" ADD CONSTRAINT "PhotoAsset_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "SignupDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoAsset" ADD CONSTRAINT "PhotoAsset_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;