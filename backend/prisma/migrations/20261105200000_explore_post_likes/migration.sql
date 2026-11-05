CREATE TABLE "PostLike" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "memberPostId" TEXT,
  "organizationPostId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostLike_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PostLike_one_post" CHECK (("memberPostId" IS NULL) <> ("organizationPostId" IS NULL)),
  CONSTRAINT "PostLike_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostLike_memberPostId_fkey" FOREIGN KEY ("memberPostId") REFERENCES "MemberPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostLike_organizationPostId_fkey" FOREIGN KEY ("organizationPostId") REFERENCES "OrganizationPost"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PostLike_memberPostId_accountId_key" ON "PostLike"("memberPostId", "accountId");
CREATE UNIQUE INDEX "PostLike_organizationPostId_accountId_key" ON "PostLike"("organizationPostId", "accountId");
CREATE INDEX "PostLike_accountId_idx" ON "PostLike"("accountId");
