CREATE TABLE "IdentityWebhookJob" (
  "id" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "lastFailure" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "IdentityWebhookJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IdentityWebhookJob_state_availableAt_idx" ON "IdentityWebhookJob"("state", "availableAt");
CREATE INDEX "IdentityWebhookJob_state_leaseUntil_idx" ON "IdentityWebhookJob"("state", "leaseUntil");
