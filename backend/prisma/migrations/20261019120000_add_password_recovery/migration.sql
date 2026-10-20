CREATE TABLE "PasswordResetChallenge" (
    "emailKey" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "accountId" TEXT,
    "passwordFingerprint" TEXT,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "requestWindowStart" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "lastRequestedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PasswordResetChallenge_pkey" PRIMARY KEY ("emailKey")
);
CREATE UNIQUE INDEX "PasswordResetChallenge_nonce_key" ON "PasswordResetChallenge"("nonce");
CREATE INDEX "PasswordResetChallenge_accountId_idx" ON "PasswordResetChallenge"("accountId");
CREATE INDEX "PasswordResetChallenge_lastRequestedAt_idx" ON "PasswordResetChallenge"("lastRequestedAt");
CREATE TABLE "PasswordRecoveryAudit" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordRecoveryAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PasswordRecoveryAudit_accountId_createdAt_idx" ON "PasswordRecoveryAudit"("accountId", "createdAt");
