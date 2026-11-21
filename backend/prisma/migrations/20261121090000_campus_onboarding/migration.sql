CREATE TABLE "CampusOnboarding" (
 "organizationId" TEXT PRIMARY KEY REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "step" INTEGER NOT NULL DEFAULT 1 CHECK ("step" BETWEEN 1 AND 4),
 "displayName" VARCHAR(160) NOT NULL, "enabledEngines" "CampusEngine"[] NOT NULL DEFAULT '{}',
 "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version">0), "requestKey" TEXT NOT NULL, "inputHash" TEXT NOT NULL,
 "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
