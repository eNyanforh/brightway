CREATE TABLE "PostSave" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "memberPostId" TEXT,
  "organizationPostId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostSave_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PostSave_one_post" CHECK (("memberPostId" IS NULL) <> ("organizationPostId" IS NULL)),
  CONSTRAINT "PostSave_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostSave_memberPostId_fkey" FOREIGN KEY ("memberPostId") REFERENCES "MemberPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostSave_organizationPostId_fkey" FOREIGN KEY ("organizationPostId") REFERENCES "OrganizationPost"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PostSave_memberPostId_accountId_key" ON "PostSave"("memberPostId", "accountId");
CREATE UNIQUE INDEX "PostSave_organizationPostId_accountId_key" ON "PostSave"("organizationPostId", "accountId");
CREATE INDEX "PostSave_accountId_createdAt_id_idx" ON "PostSave"("accountId", "createdAt", "id");
