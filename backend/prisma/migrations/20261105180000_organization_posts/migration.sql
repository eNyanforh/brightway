CREATE TABLE "OrganizationPost" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "withdrawnAt" TIMESTAMP(3),
  CONSTRAINT "OrganizationPost_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrganizationPost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrganizationPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OrganizationPost_organizationId_authorId_requestKey_key" ON "OrganizationPost"("organizationId", "authorId", "requestKey");
CREATE INDEX "OrganizationPost_withdrawnAt_createdAt_id_idx" ON "OrganizationPost"("withdrawnAt", "createdAt", "id");
CREATE INDEX "OrganizationPost_organizationId_withdrawnAt_createdAt_id_idx" ON "OrganizationPost"("organizationId", "withdrawnAt", "createdAt", "id");
CREATE INDEX "OrganizationPost_authorId_createdAt_idx" ON "OrganizationPost"("authorId", "createdAt");
