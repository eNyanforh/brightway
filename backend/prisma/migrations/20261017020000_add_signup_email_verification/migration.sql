ALTER TABLE "SignupDraft"
  ADD COLUMN "email" VARCHAR(254),
  ADD COLUMN "emailCodeHash" VARCHAR(64),
  ADD COLUMN "emailCodeExpiresAt" TIMESTAMP(3),
  ADD COLUMN "emailCodeAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "emailSendCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "emailSentAt" TIMESTAMP(3),
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "emailVerifiedUntil" TIMESTAMP(3);
CREATE TABLE "SignupEmailDeliveryLimit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "SignupEmailDeliveryLimit_expiresAt_idx" ON "SignupEmailDeliveryLimit"("expiresAt");