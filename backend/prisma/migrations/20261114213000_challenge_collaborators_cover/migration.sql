ALTER TABLE "Opportunity" ADD COLUMN "coverAssetId" TEXT;

CREATE TABLE "OpportunityCollaborator" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "state" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  CONSTRAINT "OpportunityCollaborator_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OpportunityCollaborator_state_check" CHECK ("state" IN ('PENDING', 'ACCEPTED', 'DECLINED'))
);
CREATE UNIQUE INDEX "OpportunityCollaborator_opportunityId_organizationId_key"
  ON "OpportunityCollaborator"("opportunityId", "organizationId");
CREATE INDEX "OpportunityCollaborator_organizationId_state_invitedAt_idx"
  ON "OpportunityCollaborator"("organizationId", "state", "invitedAt");
ALTER TABLE "OpportunityCollaborator" ADD CONSTRAINT "OpportunityCollaborator_opportunityId_fkey"
  FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpportunityCollaborator" ADD CONSTRAINT "OpportunityCollaborator_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
