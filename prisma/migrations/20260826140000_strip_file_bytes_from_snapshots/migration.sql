-- Reclaim the space snapshots were quietly using.
--
-- Every backup serialized every table into JSON and stored it back in the same
-- database — file bytes included, base64-inflated by a third, once per
-- snapshot. With fourteen daily snapshots kept, a megabyte of uploaded decks
-- became roughly fifteen megabytes of database, and it grew on its own without
-- anyone uploading anything new.
--
-- New backups no longer carry file contents (see src/lib/backup.ts). This
-- strips the contents out of the snapshots already taken, leaving every record
-- they hold — including each file's name, type and recorded size — untouched.
-- An empty `$bytes` marker next to a non-zero sizeBytes is how a restore knows
-- the file itself needs re-uploading.

UPDATE "Snapshot" s
SET data = jsonb_set(
  s.data,
  '{tables,storedFile}',
  (
    SELECT COALESCE(jsonb_agg(e || '{"data":{"$bytes":""}}'::jsonb), '[]'::jsonb)
    FROM jsonb_array_elements(s.data->'tables'->'storedFile') e
  )
)
WHERE jsonb_typeof(s.data->'tables'->'storedFile') = 'array';

UPDATE "Snapshot" s
SET data = jsonb_set(
  s.data,
  '{tables,ingestItem}',
  (
    SELECT COALESCE(jsonb_agg(e || '{"raw":{"$bytes":""}}'::jsonb), '[]'::jsonb)
    FROM jsonb_array_elements(s.data->'tables'->'ingestItem') e
  )
)
WHERE jsonb_typeof(s.data->'tables'->'ingestItem') = 'array';

-- The displayed size should match what is actually stored now.
UPDATE "Snapshot" SET "sizeBytes" = octet_length(data::text);

-- No VACUUM here: it cannot run inside the transaction a migration runs in.
-- Autovacuum reclaims the dead rows shortly after this, which is what stops
-- the growth; the space is then reused by future snapshots.
