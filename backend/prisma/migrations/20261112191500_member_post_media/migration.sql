CREATE TYPE "PostMediaKind" AS ENUM ('IMAGE', 'VIDEO', 'PDF');

CREATE TABLE "PostMedia" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "memberPostId" TEXT,
  "kind" "PostMediaKind" NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "contentType" VARCHAR(40) NOT NULL,
  "size" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostMedia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PostMedia_storageKey_key" ON "PostMedia"("storageKey");
CREATE INDEX "PostMedia_memberPostId_createdAt_idx" ON "PostMedia"("memberPostId", "createdAt");
CREATE INDEX "PostMedia_ownerId_createdAt_idx" ON "PostMedia"("ownerId", "createdAt");
ALTER TABLE "PostMedia" ADD CONSTRAINT "PostMedia_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostMedia" ADD CONSTRAINT "PostMedia_memberPostId_fkey" FOREIGN KEY ("memberPostId") REFERENCES "MemberPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
