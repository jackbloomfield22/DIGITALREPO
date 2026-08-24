-- AlterTable
ALTER TABLE "CreatorPerson" ADD COLUMN     "current" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "end" TEXT,
ADD COLUMN     "start" TEXT;

-- AlterTable
ALTER TABLE "IndustryPerson" ADD COLUMN     "assistantEmail" TEXT,
ADD COLUMN     "assistantName" TEXT,
ADD COLUMN     "contactUrl" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT;
