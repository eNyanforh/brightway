CREATE TYPE "ManualIdentityEvidenceKind" AS ENUM ('GOVERNMENT_ID', 'SELFIE');
CREATE TABLE "ManualIdentityEvidence" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "kind" "ManualIdentityEvidenceKind" NOT NULL,
  "state" "EvidenceState" NOT NULL DEFAULT 'UPLOADING',
  "storageKey" TEXT NOT NULL,
  "size" INTEGER NOT NULL DEFAULT 0,
  "width" INTEGER,
  "height" INTEGER,
  "consentVersion" TEXT NOT NULL,
  "consentedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManualIdentityEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManualIdentityEvidence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ManualIdentityEvidence_storageKey_key" ON "ManualIdentityEvidence"("storageKey");
CREATE INDEX "ManualIdentityEvidence_accountId_state_expiresAt_idx" ON "ManualIdentityEvidence"("accountId", "state", "expiresAt");
CREATE INDEX "ManualIdentityEvidence_state_expiresAt_idx" ON "ManualIdentityEvidence"("state", "expiresAt");
CREATE TABLE "ManualIdentityUploadBudget" (
  "accountId" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ManualIdentityUploadBudget_pkey" PRIMARY KEY ("accountId"),
  CONSTRAINT "ManualIdentityUploadBudget_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
