-- Sprint 9: no implicit Campus activation and no academic/billing records.
CREATE TYPE "CampusEngine" AS ENUM ('GRADE_SCHOOL', 'TVET');
CREATE TYPE "CampusStatus" AS ENUM ('SETUP', 'ACTIVE', 'PAUSED');

CREATE TABLE "ProductAvailability" (
  "product" VARCHAR(40) NOT NULL,
  "countryCode" VARCHAR(2) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductAvailability_pkey" PRIMARY KEY ("product","countryCode")
);
INSERT INTO "ProductAvailability" ("product","countryCode","enabled") VALUES ('VIRTUAL_CAMPUS','LR',true);

CREATE TABLE "VirtualCampus" (
  "organizationId" TEXT NOT NULL,
  "engine" "CampusEngine" NOT NULL,
  "status" "CampusStatus" NOT NULL DEFAULT 'SETUP',
  "displayName" VARCHAR(160) NOT NULL,
  "contactEmail" VARCHAR(254),
  "version" INTEGER NOT NULL DEFAULT 1,
  "activatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VirtualCampus_pkey" PRIMARY KEY ("organizationId")
);
CREATE TABLE "CampusAnnouncement" (
  "id" TEXT NOT NULL,
  "campusId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "inputHash" VARCHAR(64) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "body" VARCHAR(3000) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "withdrawnAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampusAnnouncement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "VirtualCampusAudit" (
  "id" TEXT NOT NULL,
  "campusId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" VARCHAR(40) NOT NULL,
  "data" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VirtualCampusAudit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CampusAnnouncement_campusId_authorId_requestKey_key" ON "CampusAnnouncement"("campusId","authorId","requestKey");
CREATE INDEX "CampusAnnouncement_campusId_withdrawnAt_createdAt_id_idx" ON "CampusAnnouncement"("campusId","withdrawnAt","createdAt","id");
CREATE INDEX "VirtualCampusAudit_campusId_createdAt_id_idx" ON "VirtualCampusAudit"("campusId","createdAt","id");
ALTER TABLE "VirtualCampus" ADD CONSTRAINT "VirtualCampus_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampusAnnouncement" ADD CONSTRAINT "CampusAnnouncement_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "VirtualCampus"("organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampusAnnouncement" ADD CONSTRAINT "CampusAnnouncement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VirtualCampusAudit" ADD CONSTRAINT "VirtualCampusAudit_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "VirtualCampus"("organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VirtualCampusAudit" ADD CONSTRAINT "VirtualCampusAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
