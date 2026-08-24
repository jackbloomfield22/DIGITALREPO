-- CreateTable
CREATE TABLE "KnowledgeDigest" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDigest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeDigest_name_idx" ON "KnowledgeDigest"("name");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDigest_targetType_targetId_key" ON "KnowledgeDigest"("targetType", "targetId");

-- Full-text + trigram search infrastructure for candidate matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "KnowledgeDigest"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', "searchText")) STORED;

CREATE INDEX "KnowledgeDigest_searchVector_idx" ON "KnowledgeDigest" USING GIN ("searchVector");
CREATE INDEX "KnowledgeDigest_name_trgm_idx" ON "KnowledgeDigest" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "KnowledgeDigest_searchText_trgm_idx" ON "KnowledgeDigest" USING GIN ("searchText" gin_trgm_ops);
