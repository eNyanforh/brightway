-- CreateEnum
CREATE TYPE "ContactVisibility" AS ENUM ('ONLY_ME', 'CONNECTIONS', 'PUBLIC');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "emailVisibility" "ContactVisibility" NOT NULL DEFAULT 'ONLY_ME',
ADD COLUMN     "phoneVisibility" "ContactVisibility" NOT NULL DEFAULT 'ONLY_ME',
ADD COLUMN     "whatsappNumber" VARCHAR(16),
ADD COLUMN     "whatsappVisibility" "ContactVisibility" NOT NULL DEFAULT 'ONLY_ME';