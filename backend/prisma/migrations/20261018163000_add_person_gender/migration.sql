CREATE TYPE "PersonGender" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'PREFER_NOT_TO_SAY');

ALTER TABLE "Person" ADD COLUMN "gender" "PersonGender";
