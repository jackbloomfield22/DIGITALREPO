-- The digest's searchVector is built from names and aliases; the summary
-- holds the words a person actually asks about ("prank", "golf", "Detroit").
-- HQ's brain searches both, so the summary gets its own full-text index.
CREATE INDEX IF NOT EXISTS "KnowledgeDigest_summary_fts_idx" ON "KnowledgeDigest" USING GIN (to_tsvector('english', coalesce("summary", '')));
