CREATE TABLE "MemberPost" (
  "id" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "withdrawnAt" TIMESTAMP(3),
  CONSTRAINT "MemberPost_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MemberPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MemberPost_authorId_requestKey_key" ON "MemberPost"("authorId", "requestKey");
CREATE INDEX "MemberPost_withdrawnAt_createdAt_id_idx" ON "MemberPost"("withdrawnAt", "createdAt", "id");
CREATE INDEX "MemberPost_authorId_withdrawnAt_createdAt_id_idx" ON "MemberPost"("authorId", "withdrawnAt", "createdAt", "id");
CREATE INDEX "MemberPost_authorId_createdAt_idx" ON "MemberPost"("authorId", "createdAt");
