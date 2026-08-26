-- Real files — decks, cuts, PDFs — stop living in Postgres.
--
-- Attachment bytes were written into the database because serverless disks are
-- wiped on deploy, which was fine while files meant a 2MB PDF. It is not fine
-- for an MP4. These columns record where a file actually lives, so both kinds
-- can coexist: everything already uploaded stays in the database and keeps
-- working, everything new goes to Vercel Blob.

ALTER TABLE "Attachment" ADD COLUMN "storage" TEXT NOT NULL DEFAULT 'db';
ALTER TABLE "Attachment" ADD COLUMN "blobUrl" TEXT;
ALTER TABLE "Attachment" ADD COLUMN "durationSeconds" INTEGER;
