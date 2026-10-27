BEGIN;
-- CreateTable
CREATE TABLE "OrganizationFindingArchive" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "existenceConfirmed" BOOLEAN NOT NULL,
    "locationConfirmed" BOOLEAN NOT NULL,
    "authorityConfirmed" BOOLEAN NOT NULL,
    "typeConfirmed" BOOLEAN NOT NULL,
    "operationalConfirmed" BOOLEAN NOT NULL,
    "recommendation" "OrganizationRecommendation" NOT NULL,
    "notes" VARCHAR(4000) NOT NULL,
    "setupAssistance" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "retiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredById" TEXT NOT NULL,

    CONSTRAINT "OrganizationFindingArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationFindingArchive_requestId_retiredAt_id_idx" ON "OrganizationFindingArchive"("requestId", "retiredAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationFindingArchive_requestId_sourceVersion_key" ON "OrganizationFindingArchive"("requestId", "sourceVersion");

-- AddForeignKey
ALTER TABLE "OrganizationFindingArchive" ADD CONSTRAINT "OrganizationFindingArchive_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OrganizationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationFindingArchive" ADD CONSTRAINT "OrganizationFindingArchive_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationFindingArchive" ADD CONSTRAINT "OrganizationFindingArchive_retiredById_fkey" FOREIGN KEY ("retiredById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "OrganizationFindingArchive" ADD CONSTRAINT "organization_finding_archive_positive_version" CHECK ("sourceVersion" > 0);
COMMIT;
