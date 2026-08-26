-- A record could be out of the way in two different ways: the `archived` flag,
-- which is what the Archive section reads, or a status of "archived", which is
-- how the development slate's archive arrived. Only the flag was ever shown in
-- the Archive, so the slate's shelved work was invisible there. This brings
-- the two into line — the flag becomes the single answer to "is this live?",
-- and the status is left as it is so nothing about the record is lost.

UPDATE "Format"
SET "archived" = true,
    "archivedReason" = COALESCE("archivedReason", 'Development archive — shelved on the slate'),
    "archivedAt" = COALESCE("archivedAt", NOW())
WHERE "status" = 'archived' AND "archived" = false;

UPDATE "Opportunity"
SET "archived" = true,
    "archivedReason" = COALESCE("archivedReason", 'Closed out — moved to the Archive'),
    "archivedAt" = COALESCE("archivedAt", NOW())
WHERE "status" = 'archived' AND "archived" = false;

UPDATE "Creator"
SET "archived" = true,
    "archivedReason" = COALESCE("archivedReason", 'Marked archived'),
    "archivedAt" = COALESCE("archivedAt", NOW())
WHERE "status" = 'archived' AND "archived" = false;
