CREATE TABLE "ManagementAdministrator" (
  "accountId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "grantedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManagementAdministrator_pkey" PRIMARY KEY ("accountId"),
  CONSTRAINT "ManagementAdministrator_version_check" CHECK ("version" > 0),
  CONSTRAINT "ManagementAdministrator_granted_check" CHECK (NOT "enabled" OR "grantedAt" IS NOT NULL),
  CONSTRAINT "ManagementAdministrator_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ManagementAdministrator_enabled_idx" ON "ManagementAdministrator"("enabled");
CREATE TABLE "ManagementAdministratorAudit" (
  "id" TEXT NOT NULL,
  "targetAccountId" TEXT NOT NULL,
  "actorSource" TEXT NOT NULL,
  "fromEnabled" BOOLEAN NOT NULL,
  "toEnabled" BOOLEAN NOT NULL,
  "version" INTEGER NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManagementAdministratorAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManagementAdministratorAudit_version_check" CHECK ("version" > 0),
  CONSTRAINT "ManagementAdministratorAudit_reason_check" CHECK (char_length("reason") BETWEEN 10 AND 500),
  CONSTRAINT "ManagementAdministratorAudit_targetAccountId_fkey" FOREIGN KEY ("targetAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ManagementAdministratorAudit_targetAccountId_version_key" ON "ManagementAdministratorAudit"("targetAccountId", "version");
CREATE INDEX "ManagementAdministratorAudit_createdAt_idx" ON "ManagementAdministratorAudit"("createdAt");
