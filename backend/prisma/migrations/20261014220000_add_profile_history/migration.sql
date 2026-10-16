-- CreateEnum
CREATE TYPE "ProfileHistoryMode" AS ENUM ('UNSET', 'NONE', 'RECORDS');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'VERIFIED', 'ACTION_REQUIRED', 'UNABLE_TO_VERIFY', 'FALSE_CREDENTIAL');

-- CreateEnum
CREATE TYPE "ExperienceType" AS ENUM ('EMPLOYMENT', 'INTERNSHIP', 'VOLUNTEERING', 'SELF_EMPLOYMENT');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "educationMode" "ProfileHistoryMode" NOT NULL DEFAULT 'UNSET',
ADD COLUMN     "experienceMode" "ProfileHistoryMode" NOT NULL DEFAULT 'UNSET';

-- CreateTable
CREATE TABLE "EducationRecord" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" "CredentialStatus" NOT NULL DEFAULT 'DRAFT',
    "institution" VARCHAR(160) NOT NULL,
    "qualification" VARCHAR(160) NOT NULL,
    "startMonth" VARCHAR(7) NOT NULL,
    "endMonth" VARCHAR(7),
    "current" BOOLEAN NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EducationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceRecord" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" "CredentialStatus" NOT NULL DEFAULT 'DRAFT',
    "organization" VARCHAR(160) NOT NULL,
    "role" VARCHAR(160) NOT NULL,
    "type" "ExperienceType" NOT NULL,
    "startMonth" VARCHAR(7) NOT NULL,
    "endMonth" VARCHAR(7),
    "current" BOOLEAN NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperienceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EducationRecord_profileId_createdAt_idx" ON "EducationRecord"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "ExperienceRecord_profileId_createdAt_idx" ON "ExperienceRecord"("profileId", "createdAt");

-- AddForeignKey
ALTER TABLE "EducationRecord" ADD CONSTRAINT "EducationRecord_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceRecord" ADD CONSTRAINT "ExperienceRecord_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;