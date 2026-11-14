-- Challenge prize copy is optional; legacy published listings remain valid.
ALTER TABLE "Opportunity" ADD COLUMN "prize" VARCHAR(120);

-- Saved opportunities belong to the authenticated member, not the publisher.
CREATE TABLE "OpportunitySave" (
  "accountId" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpportunitySave_pkey" PRIMARY KEY ("accountId", "opportunityId")
);

CREATE INDEX "OpportunitySave_opportunityId_idx" ON "OpportunitySave"("opportunityId");
ALTER TABLE "OpportunitySave" ADD CONSTRAINT "OpportunitySave_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpportunitySave" ADD CONSTRAINT "OpportunitySave_opportunityId_fkey"
  FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
