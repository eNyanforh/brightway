-- DropForeignKey
ALTER TABLE "ProfilePhotoReview" DROP CONSTRAINT "ProfilePhotoReview_reviewerId_fkey";

-- DropForeignKey
ALTER TABLE "IdentityNameChange" DROP CONSTRAINT "IdentityNameChange_reviewerId_fkey";

-- DropForeignKey
ALTER TABLE "OrganizationRequest" DROP CONSTRAINT "OrganizationRequest_assignedAgentId_fkey";

-- DropForeignKey
ALTER TABLE "OrganizationRequest" DROP CONSTRAINT "OrganizationRequest_decidedById_fkey";

-- DropForeignKey
ALTER TABLE "OrganizationFinding" DROP CONSTRAINT "OrganizationFinding_agentId_fkey";

-- DropForeignKey
ALTER TABLE "OrganizationFindingArchive" DROP CONSTRAINT "OrganizationFindingArchive_agentId_fkey";

-- DropForeignKey
ALTER TABLE "OrganizationFindingArchive" DROP CONSTRAINT "OrganizationFindingArchive_retiredById_fkey";

-- CreateTable
CREATE TABLE "ReviewPrincipal" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "staffId" TEXT,

    CONSTRAINT "ReviewPrincipal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagementStaff" (
    "id" TEXT NOT NULL,
    "username" VARCHAR(30) NOT NULL,
    "fullName" VARCHAR(160) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "capabilities" TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "emailVerifiedAt" TIMESTAMP(3),
    "encryptedSecret" TEXT,
    "lastCounter" BIGINT NOT NULL DEFAULT -1,
    "recoveryHashes" TEXT[],
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagementStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagementSession" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "staffVersion" INTEGER NOT NULL,
    "mfaVerifiedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagementSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagementChallenge" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "staffVersion" INTEGER NOT NULL,
    "passwordFingerprint" TEXT NOT NULL,
    "emailCodeHash" TEXT,
    "setupSecret" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagementChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagementStaffAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetStaffId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagementStaffAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagementConflict" (
    "staffId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagementConflict_pkey" PRIMARY KEY ("staffId","accountId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewPrincipal_accountId_key" ON "ReviewPrincipal"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewPrincipal_staffId_key" ON "ReviewPrincipal"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagementStaff_username_key" ON "ManagementStaff"("username");

-- CreateIndex
CREATE UNIQUE INDEX "ManagementStaff_email_key" ON "ManagementStaff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ManagementSession_tokenHash_key" ON "ManagementSession"("tokenHash");

-- CreateIndex
CREATE INDEX "ManagementSession_staffId_expiresAt_idx" ON "ManagementSession"("staffId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ManagementChallenge_tokenHash_key" ON "ManagementChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "ManagementChallenge_staffId_purpose_expiresAt_idx" ON "ManagementChallenge"("staffId", "purpose", "expiresAt");

-- CreateIndex
CREATE INDEX "ManagementStaffAudit_targetStaffId_createdAt_idx" ON "ManagementStaffAudit"("targetStaffId", "createdAt");

-- Preserve exact historic actor identifiers before installing new foreign keys.
INSERT INTO "ReviewPrincipal" (id, "accountId") SELECT id, id FROM "Account";
CREATE FUNCTION brightway_account_principal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO "ReviewPrincipal" (id, "accountId") VALUES (NEW.id, NEW.id); RETURN NEW; END $$;
CREATE TRIGGER brightway_account_principal AFTER INSERT ON "Account" FOR EACH ROW EXECUTE FUNCTION brightway_account_principal();
CREATE FUNCTION brightway_staff_principal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO "ReviewPrincipal" (id, "staffId") VALUES (NEW.id, NEW.id); RETURN NEW; END $$;
CREATE TRIGGER brightway_staff_principal AFTER INSERT ON "ManagementStaff" FOR EACH ROW EXECUTE FUNCTION brightway_staff_principal();
ALTER TABLE "ReviewPrincipal" ADD CONSTRAINT "ReviewPrincipal_one_realm" CHECK (("accountId" IS NOT NULL AND "staffId" IS NULL AND id = "accountId") OR ("staffId" IS NOT NULL AND "accountId" IS NULL AND id = "staffId"));
ALTER TABLE "ManagementStaff" ADD CONSTRAINT "ManagementStaff_namespace" CHECK (id ~ '^mg_[a-f0-9-]{36}$');
ALTER TABLE "ManagementStaff" ADD CONSTRAINT "ManagementStaff_status" CHECK (status IN ('PENDING', 'ACTIVE', 'DISABLED'));
ALTER TABLE "ManagementStaff" ADD CONSTRAINT "ManagementStaff_active_assurance" CHECK (status <> 'ACTIVE' OR ("emailVerifiedAt" IS NOT NULL AND "encryptedSecret" IS NOT NULL));
-- AddForeignKey
ALTER TABLE "ProfilePhotoReview" ADD CONSTRAINT "ProfilePhotoReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "ReviewPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityNameChange" ADD CONSTRAINT "IdentityNameChange_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "ReviewPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationRequest" ADD CONSTRAINT "OrganizationRequest_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "ReviewPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationRequest" ADD CONSTRAINT "OrganizationRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "ReviewPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationFinding" ADD CONSTRAINT "OrganizationFinding_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ReviewPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationFindingArchive" ADD CONSTRAINT "OrganizationFindingArchive_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ReviewPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationFindingArchive" ADD CONSTRAINT "OrganizationFindingArchive_retiredById_fkey" FOREIGN KEY ("retiredById") REFERENCES "ReviewPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewPrincipal" ADD CONSTRAINT "ReviewPrincipal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewPrincipal" ADD CONSTRAINT "ReviewPrincipal_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "ManagementStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementSession" ADD CONSTRAINT "ManagementSession_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "ManagementStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementChallenge" ADD CONSTRAINT "ManagementChallenge_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "ManagementStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
