-- AlterTable
ALTER TABLE "HqEvent" ADD COLUMN     "debriefedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "HqSettings" ADD COLUMN     "lastReviewAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "HqTask" ADD COLUMN     "nudgeAfterDays" INTEGER,
ADD COLUMN     "waitingSince" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "HqMention" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetKind" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqActivity" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,

    CONSTRAINT "HqActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HqMention_ownerId_targetType_targetId_idx" ON "HqMention"("ownerId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "HqMention_ownerId_sourceType_sourceId_idx" ON "HqMention"("ownerId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "HqMention_ownerId_sourceType_sourceId_targetType_targetId_key" ON "HqMention"("ownerId", "sourceType", "sourceId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "HqActivity_ownerId_at_idx" ON "HqActivity"("ownerId", "at");

