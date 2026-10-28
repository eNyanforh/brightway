BEGIN;
ALTER TYPE "OrganizationRequestStatus" ADD VALUE 'ABORTED';
-- Compare as text so PostgreSQL does not consume the new enum value before commit.
ALTER TABLE "OrganizationRequest" DROP CONSTRAINT "organization_request_assignment_required";
ALTER TABLE "OrganizationRequest" ADD CONSTRAINT "organization_request_assignment_required"
  CHECK ("status"::text IN ('SUBMITTED', 'ABORTED') OR "assignedAgentId" IS NOT NULL);
CREATE TABLE "OrganizationRequestRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestId" TEXT NOT NULL REFERENCES "OrganizationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "sourceVersion" INTEGER NOT NULL CHECK ("sourceVersion" > 0),
  "actorId" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "OrganizationRequestRevision_requestId_sourceVersion_key" ON "OrganizationRequestRevision"("requestId", "sourceVersion");
COMMIT;
