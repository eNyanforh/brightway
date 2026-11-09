-- Privacy-preserving owner dashboard analytics: only aggregated counts are exposed.
-- Events start at deployment; historic unrecorded views/searches are not backfilled.
-- Each viewer contributes at most one event per owner per UTC calendar day.

CREATE TABLE "ProfileVisit" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "viewerId" TEXT NOT NULL,
  "viewedOn" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfileVisit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfileSearchAppearance" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "viewerId" TEXT NOT NULL,
  "searchedOn" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfileSearchAppearance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfileVisit_ownerId_viewerId_viewedOn_key"
  ON "ProfileVisit"("ownerId", "viewerId", "viewedOn");
CREATE INDEX "ProfileVisit_ownerId_viewedOn_idx"
  ON "ProfileVisit"("ownerId", "viewedOn");
CREATE INDEX "ProfileVisit_viewerId_idx"
  ON "ProfileVisit"("viewerId");

CREATE UNIQUE INDEX "ProfileSearchAppearance_ownerId_viewerId_searchedOn_key"
  ON "ProfileSearchAppearance"("ownerId", "viewerId", "searchedOn");
CREATE INDEX "ProfileSearchAppearance_ownerId_searchedOn_idx"
  ON "ProfileSearchAppearance"("ownerId", "searchedOn");
CREATE INDEX "ProfileSearchAppearance_viewerId_idx"
  ON "ProfileSearchAppearance"("viewerId");

ALTER TABLE "ProfileVisit"
  ADD CONSTRAINT "ProfileVisit_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileVisit"
  ADD CONSTRAINT "ProfileVisit_viewerId_fkey"
  FOREIGN KEY ("viewerId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileSearchAppearance"
  ADD CONSTRAINT "ProfileSearchAppearance_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileSearchAppearance"
  ADD CONSTRAINT "ProfileSearchAppearance_viewerId_fkey"
  FOREIGN KEY ("viewerId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
