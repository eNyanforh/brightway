-- Challenge publishing metadata. Legacy opportunities retain safe defaults.
ALTER TABLE "Opportunity"
  ADD COLUMN "prizes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "sponsorLogoIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "backgroundAssetId" TEXT,
  ADD COLUMN "titleAssetId" TEXT,
  ADD COLUMN "maxApplicants" INTEGER;

CREATE TABLE "OpportunityAsset" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "opportunityId" TEXT,
  "kind" VARCHAR(24) NOT NULL,
  "storageKey" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpportunityAsset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OpportunityAsset_storageKey_key" ON "OpportunityAsset"("storageKey");
CREATE INDEX "OpportunityAsset_organizationId_createdAt_id_idx" ON "OpportunityAsset"("organizationId", "createdAt", "id");
CREATE INDEX "OpportunityAsset_opportunityId_kind_idx" ON "OpportunityAsset"("opportunityId", "kind");
CREATE INDEX "OpportunityAsset_uploaderId_createdAt_idx" ON "OpportunityAsset"("uploaderId", "createdAt");
ALTER TABLE "OpportunityAsset" ADD CONSTRAINT "OpportunityAsset_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpportunityAsset" ADD CONSTRAINT "OpportunityAsset_uploaderId_fkey"
  FOREIGN KEY ("uploaderId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpportunityAsset" ADD CONSTRAINT "OpportunityAsset_opportunityId_fkey"
  FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_maxApplicants_positive"
  CHECK ("maxApplicants" IS NULL OR ("maxApplicants" >= 1 AND "maxApplicants" <= 1000000));
