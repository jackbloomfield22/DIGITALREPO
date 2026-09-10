-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "airtableAttachmentId" TEXT,
ADD COLUMN     "airtableSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "IngestItem" ADD COLUMN     "blobPath" TEXT,
ADD COLUMN     "blobUrl" TEXT;

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AirtableSync" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fieldsHash" TEXT,
    "syncedAt" TIMESTAMP(3),
    "error" TEXT,
    "errorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AirtableSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AirtableJob" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'changed',
    "removeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AirtableJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AirtableSync_targetType_targetId_key" ON "AirtableSync"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "AirtableJob_targetType_targetId_key" ON "AirtableJob"("targetType", "targetId");

