/*
  Warnings:

  - You are about to drop the `ResearchInboxItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ResearchInboxItem" DROP CONSTRAINT "ResearchInboxItem_createdById_fkey";



-- CreateTable
CREATE TABLE "IngestItem" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filename" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "raw" BYTEA,
    "rawRetained" BOOLEAN NOT NULL DEFAULT false,
    "extractedText" TEXT,
    "metadata" JSONB,
    "parentId" TEXT,
    "threadId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "relevance" JSONB,
    "tokenUsage" JSONB,
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestChange" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "destination" JSONB NOT NULL,
    "opType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "rationale" TEXT,
    "evidence" JSONB,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "editedAfter" JSONB,
    "appliedAt" TIMESTAMP(3),
    "appliedById" TEXT,
    "error" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IngestItem_status_idx" ON "IngestItem"("status");

-- CreateIndex
CREATE INDEX "IngestItem_threadId_idx" ON "IngestItem"("threadId");

-- CreateIndex
CREATE INDEX "IngestItem_createdAt_idx" ON "IngestItem"("createdAt");

-- CreateIndex
CREATE INDEX "IngestChange_itemId_status_idx" ON "IngestChange"("itemId", "status");

-- AddForeignKey
ALTER TABLE "IngestItem" ADD CONSTRAINT "IngestItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "IngestItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestItem" ADD CONSTRAINT "IngestItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestChange" ADD CONSTRAINT "IngestChange_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "IngestItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry Research Inbox history into the new pipeline, then retire the table.
INSERT INTO "IngestItem" ("id", "kind", "extractedText", "status", "createdById", "createdAt", "updatedAt", "rawRetained")
SELECT "id", 'text', "rawText",
  CASE "status" WHEN 'applied' THEN 'applied' WHEN 'dismissed' THEN 'irrelevant' ELSE 'parsed' END,
  "createdById", "createdAt", "updatedAt", false
FROM "ResearchInboxItem";

DROP TABLE "ResearchInboxItem";
