-- AlterTable
ALTER TABLE "Format" ADD COLUMN     "lastActivityAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "lastActivityAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "lastActivityAt" TIMESTAMP(3);
