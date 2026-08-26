-- Documents that live in the Repo and are edited in place. The development
-- slate is the first: a Google Doc everyone linked to and nobody could read
-- from inside the Repo, now sitting next to the records it describes.

CREATE TABLE "Doc" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Doc_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Doc_slug_key" ON "Doc"("slug");

CREATE TABLE "DocRevision" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocRevision_docId_createdAt_idx" ON "DocRevision"("docId", "createdAt");

ALTER TABLE "DocRevision" ADD CONSTRAINT "DocRevision_docId_fkey"
    FOREIGN KEY ("docId") REFERENCES "Doc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
