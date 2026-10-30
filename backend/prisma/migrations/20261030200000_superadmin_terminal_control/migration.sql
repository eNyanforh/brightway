ALTER TABLE "ManagementAdministrator" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;
-- Existing management grants were made only by the trusted server operator.
UPDATE "ManagementAdministrator" SET "isSuperAdmin" = "enabled";
ALTER TABLE "ManagementAdministratorAudit"
  ADD COLUMN "actorAccountId" TEXT,
  ADD COLUMN "capability" VARCHAR(40) NOT NULL DEFAULT 'superadmin',
  ADD COLUMN "capabilityEnabled" BOOLEAN,
  ADD COLUMN "toSuperAdmin" BOOLEAN NOT NULL DEFAULT false;
UPDATE "ManagementAdministratorAudit" SET "toSuperAdmin" = "toEnabled", "capabilityEnabled" = "toEnabled";
ALTER TABLE "ManagementAdministratorAudit" ADD CONSTRAINT "ManagementAdministratorAudit_actorAccountId_fkey" FOREIGN KEY ("actorAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManagementAdministrator" ADD CONSTRAINT "ManagementAdministrator_superadmin_enabled" CHECK (NOT "isSuperAdmin" OR "enabled");
