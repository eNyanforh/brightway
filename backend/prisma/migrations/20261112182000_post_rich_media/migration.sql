CREATE TYPE "PostMediaKind" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT');

CREATE TABLE "PostMedia" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "postId" TEXT,
  "storageKey" TEXT NOT NULL,
  "kind" "PostMediaKind" NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "contentType" VARCHAR(64) NOT NULL,
  "size" INTEGER NOT NULL,
  "pageCount" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "discardedAt" TIMESTAMP(3),
  CONSTRAINT "PostMedia_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PostMedia_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "MemberPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostMedia_size_check" CHECK ("size" > 0 AND "size" <= 26214400)
);
CREATE UNIQUE INDEX "PostMedia_storageKey_key" ON "PostMedia"("storageKey");
CREATE INDEX "PostMedia_ownerId_createdAt_idx" ON "PostMedia"("ownerId", "createdAt");
CREATE INDEX "PostMedia_postId_createdAt_idx" ON "PostMedia"("postId", "createdAt");

CREATE TABLE "PostMediaUploadAttempt" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "inputSize" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostMediaUploadAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PostMediaUploadAttempt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PostMediaUploadAttempt_ownerId_createdAt_idx" ON "PostMediaUploadAttempt"("ownerId", "createdAt");
