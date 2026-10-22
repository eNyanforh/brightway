CREATE TABLE "IdentityVerification" (
  "accountId" TEXT NOT NULL,
  "currentAttemptId" TEXT,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "startCount" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "IdentityVerification_pkey" PRIMARY KEY ("accountId")
);
CREATE TABLE "IdentityInquiry" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'sandbox',
  "templateId" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "identityHash" VARCHAR(64) NOT NULL,
  "inquiryId" TEXT,
  "providerStatus" TEXT NOT NULL DEFAULT 'creating',
  "providerUpdatedAt" TIMESTAMP(3),
  "checkedAt" TIMESTAMP(3),
  "createRetryUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdentityInquiry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdentityInquiry_sandbox_only" CHECK ("environment" = 'sandbox')
);
CREATE TABLE "IdentityWebhookReceipt" (
  "id" TEXT NOT NULL,
  "inquiryId" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdentityWebhookReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IdentityInquiry_referenceId_key" ON "IdentityInquiry"("referenceId");
CREATE UNIQUE INDEX "IdentityInquiry_idempotencyKey_key" ON "IdentityInquiry"("idempotencyKey");
CREATE UNIQUE INDEX "IdentityInquiry_inquiryId_key" ON "IdentityInquiry"("inquiryId");
CREATE INDEX "IdentityInquiry_accountId_createdAt_idx" ON "IdentityInquiry"("accountId", "createdAt");
CREATE INDEX "IdentityWebhookReceipt_createdAt_idx" ON "IdentityWebhookReceipt"("createdAt");
ALTER TABLE "IdentityVerification" ADD CONSTRAINT "IdentityVerification_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdentityInquiry" ADD CONSTRAINT "IdentityInquiry_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "IdentityVerification"("accountId") ON DELETE CASCADE ON UPDATE CASCADE;
