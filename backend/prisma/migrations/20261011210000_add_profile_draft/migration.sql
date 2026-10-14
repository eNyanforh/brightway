-- CreateEnum
CREATE TYPE "CareerFieldMode" AS ENUM ('EXPLORING', 'SPECIFIED');

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "countryCode" VARCHAR(2),
    "region" VARCHAR(100),
    "locality" VARCHAR(100),
    "headline" VARCHAR(120),
    "bio" VARCHAR(2000),
    "careerFieldMode" "CareerFieldMode",
    "careerField" VARCHAR(100),
    "careerGoals" VARCHAR(1000),
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_personId_key" ON "Profile"("personId");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;