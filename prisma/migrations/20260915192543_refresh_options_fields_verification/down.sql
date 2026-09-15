-- Reverses 20260915192543_refresh_options_fields_verification. Additive
-- columns come off; nothing else is touched. Run by hand with psql against
-- the direct (unpooled) connection, then delete the row for this migration
-- from "_prisma_migrations".

DROP INDEX IF EXISTS "Creator_custom_deal_status_idx";
DROP INDEX IF EXISTS "Creator_custom_exclusivity_end_idx";
DROP INDEX IF EXISTS "Project_custom_stage_idx";
DROP INDEX IF EXISTS "Format_custom_stage_idx";
DROP INDEX IF EXISTS "Opportunity_custom_stage_idx";
DROP INDEX IF EXISTS "Opportunity_custom_follow_up_date_idx";

ALTER TABLE "Creator" DROP CONSTRAINT IF EXISTS "Creator_ownerId_fkey";
ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_ownerId_fkey";
ALTER TABLE "Organization" DROP CONSTRAINT IF EXISTS "Organization_ownerId_fkey";
ALTER TABLE "IndustryPerson" DROP CONSTRAINT IF EXISTS "IndustryPerson_ownerId_fkey";

DROP TABLE IF EXISTS "FieldDefinition";
DROP TABLE IF EXISTS "Option";

ALTER TABLE "Channel" DROP COLUMN IF EXISTS "custom", DROP COLUMN IF EXISTS "mergedInto", DROP COLUMN IF EXISTS "verifiedAt", DROP COLUMN IF EXISTS "verifiedBy";
ALTER TABLE "Creator" DROP COLUMN IF EXISTS "custom", DROP COLUMN IF EXISTS "mergedInto", DROP COLUMN IF EXISTS "ownerId", DROP COLUMN IF EXISTS "verifiedAt", DROP COLUMN IF EXISTS "verifiedBy";
ALTER TABLE "Format" DROP COLUMN IF EXISTS "custom", DROP COLUMN IF EXISTS "mergedInto", DROP COLUMN IF EXISTS "verifiedAt", DROP COLUMN IF EXISTS "verifiedBy";
ALTER TABLE "IndustryPerson" DROP COLUMN IF EXISTS "custom", DROP COLUMN IF EXISTS "mergedInto", DROP COLUMN IF EXISTS "ownerId", DROP COLUMN IF EXISTS "verifiedAt", DROP COLUMN IF EXISTS "verifiedBy", DROP COLUMN IF EXISTS "version";
ALTER TABLE "Opportunity" DROP COLUMN IF EXISTS "custom", DROP COLUMN IF EXISTS "mergedInto", DROP COLUMN IF EXISTS "verifiedAt", DROP COLUMN IF EXISTS "verifiedBy";
ALTER TABLE "Organization" DROP COLUMN IF EXISTS "custom", DROP COLUMN IF EXISTS "mergedInto", DROP COLUMN IF EXISTS "ownerId", DROP COLUMN IF EXISTS "verifiedAt", DROP COLUMN IF EXISTS "verifiedBy";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "custom", DROP COLUMN IF EXISTS "mergedInto", DROP COLUMN IF EXISTS "ownerId", DROP COLUMN IF EXISTS "verifiedAt", DROP COLUMN IF EXISTS "verifiedBy";
