CREATE TABLE "PostComment" (
  "id" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "memberPostId" TEXT,
  "organizationPostId" TEXT,
  "requestKey" TEXT NOT NULL,
  "body" VARCHAR(1000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "PostComment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PostComment_one_post" CHECK (("memberPostId" IS NULL) <> ("organizationPostId" IS NULL)),
  CONSTRAINT "PostComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostComment_memberPostId_fkey" FOREIGN KEY ("memberPostId") REFERENCES "MemberPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostComment_organizationPostId_fkey" FOREIGN KEY ("organizationPostId") REFERENCES "OrganizationPost"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PostComment_authorId_requestKey_key" ON "PostComment"("authorId", "requestKey");
CREATE INDEX "PostComment_authorId_createdAt_idx" ON "PostComment"("authorId", "createdAt");
CREATE INDEX "PostComment_memberPostId_deletedAt_createdAt_id_idx" ON "PostComment"("memberPostId", "deletedAt", "createdAt", "id");
CREATE INDEX "PostComment_organizationPostId_deletedAt_createdAt_id_idx" ON "PostComment"("organizationPostId", "deletedAt", "createdAt", "id");
