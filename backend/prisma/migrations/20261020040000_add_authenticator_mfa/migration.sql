ALTER TABLE "Session" ADD COLUMN "mfaVersion" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3);
CREATE TABLE "MfaFactor" (
    "accountId" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "lastCounter" BIGINT NOT NULL DEFAULT -1,
    "setupExpiresAt" TIMESTAMP(3),
    "recoveryHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MfaFactor_pkey" PRIMARY KEY ("accountId")
);
CREATE TABLE "MfaLoginChallenge" (
    "tokenHash" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "passwordFingerprint" TEXT NOT NULL,
    "factorVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MfaLoginChallenge_pkey" PRIMARY KEY ("tokenHash")
);
CREATE INDEX "MfaLoginChallenge_accountId_idx" ON "MfaLoginChallenge"("accountId");
CREATE INDEX "MfaLoginChallenge_expiresAt_idx" ON "MfaLoginChallenge"("expiresAt");
CREATE TABLE "MfaAudit" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "method" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MfaAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MfaAudit_accountId_createdAt_idx" ON "MfaAudit"("accountId", "createdAt");
