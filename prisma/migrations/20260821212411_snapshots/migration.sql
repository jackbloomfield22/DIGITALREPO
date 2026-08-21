-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'manual',
    "label" TEXT,
    "counts" JSONB NOT NULL,
    "data" JSONB NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Snapshot_createdAt_idx" ON "Snapshot"("createdAt");
