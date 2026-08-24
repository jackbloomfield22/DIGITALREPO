-- AlterTable
ALTER TABLE "Creator" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedReason" TEXT;

-- AlterTable
ALTER TABLE "Format" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedReason" TEXT;

-- AlterTable
ALTER TABLE "IndustryPerson" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedReason" TEXT;

-- Convert searchVector from a GENERATED column to a trigger-maintained one.
-- Prisma's schema diff cannot represent generated columns and kept emitting
-- invalid ALTERs; a trigger keeps the tsvector current with zero drift.
DROP INDEX IF EXISTS "KnowledgeDigest_searchVector_idx";
ALTER TABLE "KnowledgeDigest" DROP COLUMN "searchVector";
ALTER TABLE "KnowledgeDigest" ADD COLUMN "searchVector" tsvector;

CREATE OR REPLACE FUNCTION knowledge_digest_search_vector() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" := to_tsvector('simple', NEW."searchText");
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER knowledge_digest_search_vector_trg
BEFORE INSERT OR UPDATE OF "searchText" ON "KnowledgeDigest"
FOR EACH ROW EXECUTE FUNCTION knowledge_digest_search_vector();

UPDATE "KnowledgeDigest" SET "searchText" = "searchText";
CREATE INDEX "KnowledgeDigest_searchVector_idx" ON "KnowledgeDigest" USING GIN ("searchVector");

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedReason" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedReason" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedReason" TEXT;
