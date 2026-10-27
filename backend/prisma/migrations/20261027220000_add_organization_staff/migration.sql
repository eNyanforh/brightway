BEGIN;
-- CreateEnum
CREATE TYPE "OrganizationInvitationState" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "OrganizationMembershipRole" ADD VALUE 'STAFF';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "staffVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "OrganizationMembership" ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "OrganizationInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "permissions" TEXT[],
    "idempotencyKey" TEXT NOT NULL,
    "inputHash" VARCHAR(64) NOT NULL,
    "state" "OrganizationInvitationState" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationStaffAudit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "entityId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationStaffAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationInvitation_recipientId_state_createdAt_id_idx" ON "OrganizationInvitation"("recipientId", "state", "createdAt", "id");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_organizationId_state_createdAt_id_idx" ON "OrganizationInvitation"("organizationId", "state", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationInvitation_organizationId_senderId_idempotencyK_key" ON "OrganizationInvitation"("organizationId", "senderId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "OrganizationStaffAudit_organizationId_createdAt_id_idx" ON "OrganizationStaffAudit"("organizationId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationStaffAudit" ADD CONSTRAINT "OrganizationStaffAudit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationStaffAudit" ADD CONSTRAINT "OrganizationStaffAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE UNIQUE INDEX "OrganizationInvitation_one_pending_recipient" ON "OrganizationInvitation" ("organizationId", "recipientId") WHERE "state" = 'PENDING';
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "organization_membership_positive_version" CHECK ("version" > 0);
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "organization_invitation_positive_version" CHECK ("version" > 0);
ALTER TABLE "Organization" ADD CONSTRAINT "organization_positive_staff_version" CHECK ("staffVersion" > 0);
COMMIT;
