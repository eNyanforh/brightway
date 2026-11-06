CREATE TABLE "PostRepost" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "memberPostId" TEXT,
  "organizationPostId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostRepost_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PostRepost_one_post" CHECK (("memberPostId" IS NULL) <> ("organizationPostId" IS NULL)),
  CONSTRAINT "PostRepost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostRepost_memberPostId_fkey" FOREIGN KEY ("memberPostId") REFERENCES "MemberPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostRepost_organizationPostId_fkey" FOREIGN KEY ("organizationPostId") REFERENCES "OrganizationPost"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PostRepost_memberPostId_accountId_key" ON "PostRepost"("memberPostId", "accountId");
CREATE UNIQUE INDEX "PostRepost_organizationPostId_accountId_key" ON "PostRepost"("organizationPostId", "accountId");
CREATE INDEX "PostRepost_createdAt_id_idx" ON "PostRepost"("createdAt", "id");
CREATE INDEX "PostRepost_accountId_createdAt_id_idx" ON "PostRepost"("accountId", "createdAt", "id");
