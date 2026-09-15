-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "custom" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "mergedInto" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBy" TEXT;

-- AlterTable
ALTER TABLE "Creator" ADD COLUMN     "custom" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "mergedInto" TEXT,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBy" TEXT;

-- AlterTable
ALTER TABLE "Format" ADD COLUMN     "custom" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "mergedInto" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBy" TEXT;

-- AlterTable
ALTER TABLE "IndustryPerson" ADD COLUMN     "custom" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "mergedInto" TEXT,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBy" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "custom" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "mergedInto" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBy" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "custom" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "mergedInto" TEXT,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBy" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "custom" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "mergedInto" TEXT,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBy" TEXT;

-- CreateTable
CREATE TABLE "Option" (
    "id" TEXT NOT NULL,
    "setKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "mergedInto" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldDefinition" (
    "id" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "optionSetKey" TEXT,
    "relationType" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "indexed" BOOLEAN NOT NULL DEFAULT false,
    "showInNeedsAttention" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Option_setKey_position_idx" ON "Option"("setKey", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Option_setKey_value_key" ON "Option"("setKey", "value");

-- CreateIndex
CREATE INDEX "FieldDefinition_recordType_position_idx" ON "FieldDefinition"("recordType", "position");

-- CreateIndex
CREATE UNIQUE INDEX "FieldDefinition_recordType_key_key" ON "FieldDefinition"("recordType", "key");

-- AddForeignKey
ALTER TABLE "Creator" ADD CONSTRAINT "Creator_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndustryPerson" ADD CONSTRAINT "IndustryPerson_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Data: every hardcoded option list becomes rows. Values are the slugs records
-- already store, so nothing on a record changes; labels can now be renamed.
-- ---------------------------------------------------------------------------
INSERT INTO "Option" ("id", "setKey", "value", "label", "position", "createdAt", "updatedAt") VALUES
('opt_project_role_host', 'project_role', 'host', 'Host', 0, now(), now()),
('opt_project_role_co_host', 'project_role', 'co_host', 'Co Host', 10, now(), now()),
('opt_project_role_star', 'project_role', 'star', 'Star', 20, now(), now()),
('opt_project_role_subject', 'project_role', 'subject', 'Subject', 30, now(), now()),
('opt_project_role_cast', 'project_role', 'cast', 'Cast', 40, now(), now()),
('opt_project_role_contestant', 'project_role', 'contestant', 'Contestant', 50, now(), now()),
('opt_project_role_participant', 'project_role', 'participant', 'Participant', 60, now(), now()),
('opt_project_role_guest', 'project_role', 'guest', 'Guest', 70, now(), now()),
('opt_project_role_recurring_guest', 'project_role', 'recurring_guest', 'Recurring Guest', 80, now(), now()),
('opt_project_role_creator', 'project_role', 'creator', 'Creator', 90, now(), now()),
('opt_project_role_executive_producer', 'project_role', 'executive_producer', 'Executive Producer', 100, now(), now()),
('opt_project_role_producer', 'project_role', 'producer', 'Producer', 110, now(), now()),
('opt_project_role_director', 'project_role', 'director', 'Director', 120, now(), now()),
('opt_project_role_writer', 'project_role', 'writer', 'Writer', 130, now(), now()),
('opt_project_role_voice_talent', 'project_role', 'voice_talent', 'Voice Talent', 140, now(), now()),
('opt_project_role_correspondent', 'project_role', 'correspondent', 'Correspondent', 150, now(), now()),
('opt_project_role_founder', 'project_role', 'founder', 'Founder', 160, now(), now()),
('opt_project_role_owner', 'project_role', 'owner', 'Owner', 170, now(), now()),
('opt_project_role_other', 'project_role', 'other', 'Other', 180, now(), now()),
('opt_project_type_tv_series', 'project_type', 'tv_series', 'Tv Series', 0, now(), now()),
('opt_project_type_documentary', 'project_type', 'documentary', 'Documentary', 10, now(), now()),
('opt_project_type_docuseries', 'project_type', 'docuseries', 'Docuseries', 20, now(), now()),
('opt_project_type_youtube_series', 'project_type', 'youtube_series', 'Youtube Series', 30, now(), now()),
('opt_project_type_digital_franchise', 'project_type', 'digital_franchise', 'Digital Franchise', 40, now(), now()),
('opt_project_type_podcast', 'project_type', 'podcast', 'Podcast', 50, now(), now()),
('opt_project_type_livestream', 'project_type', 'livestream', 'Livestream', 60, now(), now()),
('opt_project_type_film', 'project_type', 'film', 'Film', 70, now(), now()),
('opt_project_type_reality_series', 'project_type', 'reality_series', 'Reality Series', 80, now(), now()),
('opt_project_type_competition_show', 'project_type', 'competition_show', 'Competition Show', 90, now(), now()),
('opt_project_type_branded_series', 'project_type', 'branded_series', 'Branded Series', 100, now(), now()),
('opt_project_type_short_form_series', 'project_type', 'short_form_series', 'Short Form Series', 110, now(), now()),
('opt_project_type_social_franchise', 'project_type', 'social_franchise', 'Social Franchise', 120, now(), now()),
('opt_project_type_special', 'project_type', 'special', 'Special', 130, now(), now()),
('opt_project_type_other', 'project_type', 'other', 'Other', 140, now(), now()),
('opt_project_status_announced', 'project_status', 'announced', 'Announced', 0, now(), now()),
('opt_project_status_in_production', 'project_status', 'in_production', 'In Production', 10, now(), now()),
('opt_project_status_airing', 'project_status', 'airing', 'Airing', 20, now(), now()),
('opt_project_status_released', 'project_status', 'released', 'Released', 30, now(), now()),
('opt_project_status_ended', 'project_status', 'ended', 'Ended', 40, now(), now()),
('opt_project_status_cancelled', 'project_status', 'cancelled', 'Cancelled', 50, now(), now()),
('opt_org_type_production_company', 'org_type', 'production_company', 'Production Company', 0, now(), now()),
('opt_org_type_studio', 'org_type', 'studio', 'Studio', 10, now(), now()),
('opt_org_type_network', 'org_type', 'network', 'Network', 20, now(), now()),
('opt_org_type_streamer', 'org_type', 'streamer', 'Streamer', 30, now(), now()),
('opt_org_type_digital_platform', 'org_type', 'digital_platform', 'Digital Platform', 40, now(), now()),
('opt_org_type_brand', 'org_type', 'brand', 'Brand', 50, now(), now()),
('opt_org_type_agency', 'org_type', 'agency', 'Agency', 60, now(), now()),
('opt_org_type_management_company', 'org_type', 'management_company', 'Management Company', 70, now(), now()),
('opt_org_type_creator_owned_company', 'org_type', 'creator_owned_company', 'Creator Owned Company', 80, now(), now()),
('opt_org_type_investment_firm', 'org_type', 'investment_firm', 'Investment Firm', 90, now(), now()),
('opt_org_type_startup', 'org_type', 'startup', 'Startup', 100, now(), now()),
('opt_org_type_podcast_company', 'org_type', 'podcast_company', 'Podcast Company', 110, now(), now()),
('opt_org_type_publisher', 'org_type', 'publisher', 'Publisher', 120, now(), now()),
('opt_org_type_sports_team', 'org_type', 'sports_team', 'Sports Team', 130, now(), now()),
('opt_org_type_sports_league', 'org_type', 'sports_league', 'Sports League', 140, now(), now()),
('opt_org_type_nonprofit', 'org_type', 'nonprofit', 'Nonprofit', 150, now(), now()),
('opt_org_type_other', 'org_type', 'other', 'Other', 160, now(), now()),
('opt_org_type_buyer', 'org_type', 'buyer', 'Buyer', 170, now(), now()),
('opt_project_org_relationship_production_company', 'project_org_relationship', 'production_company', 'Production Company', 0, now(), now()),
('opt_project_org_relationship_co_production_company', 'project_org_relationship', 'co_production_company', 'Co Production Company', 10, now(), now()),
('opt_project_org_relationship_studio', 'project_org_relationship', 'studio', 'Studio', 20, now(), now()),
('opt_project_org_relationship_network', 'project_org_relationship', 'network', 'Network', 30, now(), now()),
('opt_project_org_relationship_streamer', 'project_org_relationship', 'streamer', 'Streamer', 40, now(), now()),
('opt_project_org_relationship_distributor', 'project_org_relationship', 'distributor', 'Distributor', 50, now(), now()),
('opt_project_org_relationship_financier', 'project_org_relationship', 'financier', 'Financier', 60, now(), now()),
('opt_project_org_relationship_brand_partner', 'project_org_relationship', 'brand_partner', 'Brand Partner', 70, now(), now()),
('opt_project_org_relationship_sponsor', 'project_org_relationship', 'sponsor', 'Sponsor', 80, now(), now()),
('opt_project_org_relationship_agency', 'project_org_relationship', 'agency', 'Agency', 90, now(), now()),
('opt_project_org_relationship_rights_holder', 'project_org_relationship', 'rights_holder', 'Rights Holder', 100, now(), now()),
('opt_project_org_relationship_publisher', 'project_org_relationship', 'publisher', 'Publisher', 110, now(), now()),
('opt_project_org_relationship_platform', 'project_org_relationship', 'platform', 'Platform', 120, now(), now()),
('opt_creator_org_relationship_ambassador', 'creator_org_relationship', 'ambassador', 'Ambassador', 0, now(), now()),
('opt_creator_org_relationship_campaign', 'creator_org_relationship', 'campaign', 'Campaign', 10, now(), now()),
('opt_creator_org_relationship_sponsored_content', 'creator_org_relationship', 'sponsored_content', 'Sponsored Content', 20, now(), now()),
('opt_creator_org_relationship_partner', 'creator_org_relationship', 'partner', 'Partner', 30, now(), now()),
('opt_creator_org_relationship_advisor', 'creator_org_relationship', 'advisor', 'Advisor', 40, now(), now()),
('opt_creator_org_relationship_investor', 'creator_org_relationship', 'investor', 'Investor', 50, now(), now()),
('opt_creator_org_relationship_founder', 'creator_org_relationship', 'founder', 'Founder', 60, now(), now()),
('opt_creator_org_relationship_owner', 'creator_org_relationship', 'owner', 'Owner', 70, now(), now()),
('opt_creator_org_relationship_athlete', 'creator_org_relationship', 'athlete', 'Athlete', 80, now(), now()),
('opt_creator_org_relationship_collaboration', 'creator_org_relationship', 'collaboration', 'Collaboration', 90, now(), now()),
('opt_creator_org_relationship_team_member', 'creator_org_relationship', 'team_member', 'Team Member', 100, now(), now()),
('opt_creator_org_relationship_other', 'creator_org_relationship', 'other', 'Other', 110, now(), now()),
('opt_person_role_type_agent', 'person_role_type', 'agent', 'Agent', 0, now(), now()),
('opt_person_role_type_manager', 'person_role_type', 'manager', 'Manager', 10, now(), now()),
('opt_person_role_type_publicist', 'person_role_type', 'publicist', 'Publicist', 20, now(), now()),
('opt_person_role_type_producer', 'person_role_type', 'producer', 'Producer', 30, now(), now()),
('opt_person_role_type_executive', 'person_role_type', 'executive', 'Executive', 40, now(), now()),
('opt_person_role_type_director', 'person_role_type', 'director', 'Director', 50, now(), now()),
('opt_person_role_type_showrunner', 'person_role_type', 'showrunner', 'Showrunner', 60, now(), now()),
('opt_person_role_type_attorney', 'person_role_type', 'attorney', 'Attorney', 70, now(), now()),
('opt_person_role_type_other', 'person_role_type', 'other', 'Other', 80, now(), now()),
('opt_creator_person_relationship_agent', 'creator_person_relationship', 'agent', 'Agent', 0, now(), now()),
('opt_creator_person_relationship_manager', 'creator_person_relationship', 'manager', 'Manager', 10, now(), now()),
('opt_creator_person_relationship_publicist', 'creator_person_relationship', 'publicist', 'Publicist', 20, now(), now()),
('opt_creator_person_relationship_attorney', 'creator_person_relationship', 'attorney', 'Attorney', 30, now(), now()),
('opt_creator_person_relationship_producer', 'creator_person_relationship', 'producer', 'Producer', 40, now(), now()),
('opt_creator_person_relationship_other', 'creator_person_relationship', 'other', 'Other', 50, now(), now()),
('opt_person_project_role_director', 'person_project_role', 'director', 'Director', 0, now(), now()),
('opt_person_project_role_showrunner', 'person_project_role', 'showrunner', 'Showrunner', 10, now(), now()),
('opt_person_project_role_executive_producer', 'person_project_role', 'executive_producer', 'Executive Producer', 20, now(), now()),
('opt_person_project_role_producer', 'person_project_role', 'producer', 'Producer', 30, now(), now()),
('opt_person_project_role_creator', 'person_project_role', 'creator', 'Creator', 40, now(), now()),
('opt_person_project_role_writer', 'person_project_role', 'writer', 'Writer', 50, now(), now()),
('opt_person_project_role_other', 'person_project_role', 'other', 'Other', 60, now(), now()),
('opt_creator_relationship_collaborated_with', 'creator_relationship', 'collaborated_with', 'Collaborated With', 0, now(), now()),
('opt_creator_relationship_co_host', 'creator_relationship', 'co_host', 'Co Host', 10, now(), now()),
('opt_creator_relationship_business_partner', 'creator_relationship', 'business_partner', 'Business Partner', 20, now(), now()),
('opt_creator_relationship_teammate', 'creator_relationship', 'teammate', 'Teammate', 30, now(), now()),
('opt_creator_relationship_co_star', 'creator_relationship', 'co_star', 'Co Star', 40, now(), now()),
('opt_creator_relationship_recurring_content_partner', 'creator_relationship', 'recurring_content_partner', 'Recurring Content Partner', 50, now(), now()),
('opt_creator_relationship_podcasted_with', 'creator_relationship', 'podcasted_with', 'Podcasted With', 60, now(), now()),
('opt_creator_relationship_family', 'creator_relationship', 'family', 'Family', 70, now(), now()),
('opt_creator_relationship_other', 'creator_relationship', 'other', 'Other', 80, now(), now()),
('opt_format_status_idea', 'format_status', 'idea', 'Idea', 0, now(), now()),
('opt_format_status_concept', 'format_status', 'concept', 'Concept', 10, now(), now()),
('opt_format_status_developing', 'format_status', 'developing', 'Developing', 20, now(), now()),
('opt_format_status_on_hold', 'format_status', 'on_hold', 'On Hold', 30, now(), now()),
('opt_format_status_outbound', 'format_status', 'outbound', 'Outbound', 40, now(), now()),
('opt_format_status_pitched', 'format_status', 'pitched', 'Pitched', 50, now(), now()),
('opt_format_status_in_discussion', 'format_status', 'in_discussion', 'In Discussion', 60, now(), now()),
('opt_format_status_sold', 'format_status', 'sold', 'Sold', 70, now(), now()),
('opt_format_status_in_production', 'format_status', 'in_production', 'In Production', 80, now(), now()),
('opt_format_status_post_production', 'format_status', 'post_production', 'Post Production', 90, now(), now()),
('opt_format_status_produced', 'format_status', 'produced', 'Produced', 100, now(), now()),
('opt_format_status_passed', 'format_status', 'passed', 'Passed', 110, now(), now()),
('opt_format_status_archived', 'format_status', 'archived', 'Archived', 120, now(), now()),
('opt_format_type_competition', 'format_type', 'competition', 'Competition', 0, now(), now()),
('opt_format_type_docuseries', 'format_type', 'docuseries', 'Docuseries', 10, now(), now()),
('opt_format_type_documentary', 'format_type', 'documentary', 'Documentary', 20, now(), now()),
('opt_format_type_talk_show', 'format_type', 'talk_show', 'Talk Show', 30, now(), now()),
('opt_format_type_game_show', 'format_type', 'game_show', 'Game Show', 40, now(), now()),
('opt_format_type_podcast', 'format_type', 'podcast', 'Podcast', 50, now(), now()),
('opt_format_type_digital_series', 'format_type', 'digital_series', 'Digital Series', 60, now(), now()),
('opt_format_type_reality_series', 'format_type', 'reality_series', 'Reality Series', 70, now(), now()),
('opt_format_type_branded_series', 'format_type', 'branded_series', 'Branded Series', 80, now(), now()),
('opt_format_type_event', 'format_type', 'event', 'Event', 90, now(), now()),
('opt_format_type_film', 'format_type', 'film', 'Film', 100, now(), now()),
('opt_format_type_other', 'format_type', 'other', 'Other', 110, now(), now()),
('opt_opportunity_type_brand_brief', 'opportunity_type', 'brand_brief', 'Brand Brief', 0, now(), now()),
('opt_opportunity_type_casting_need', 'opportunity_type', 'casting_need', 'Casting Need', 10, now(), now()),
('opt_opportunity_type_development_target', 'opportunity_type', 'development_target', 'Development Target', 20, now(), now()),
('opt_opportunity_type_partnership', 'opportunity_type', 'partnership', 'Partnership', 30, now(), now()),
('opt_opportunity_type_event', 'opportunity_type', 'event', 'Event', 40, now(), now()),
('opt_opportunity_type_outreach', 'opportunity_type', 'outreach', 'Outreach', 50, now(), now()),
('opt_opportunity_type_platform_ask', 'opportunity_type', 'platform_ask', 'Platform Ask', 60, now(), now()),
('opt_opportunity_type_sponsor_opportunity', 'opportunity_type', 'sponsor_opportunity', 'Sponsor Opportunity', 70, now(), now()),
('opt_opportunity_type_internal_research_question', 'opportunity_type', 'internal_research_question', 'Internal Research Question', 80, now(), now()),
('opt_opportunity_type_other', 'opportunity_type', 'other', 'Other', 90, now(), now()),
('opt_opportunity_status_researching', 'opportunity_status', 'researching', 'Researching', 0, now(), now()),
('opt_opportunity_status_active', 'opportunity_status', 'active', 'Active', 10, now(), now()),
('opt_opportunity_status_on_hold', 'opportunity_status', 'on_hold', 'On Hold', 20, now(), now()),
('opt_opportunity_status_outbound', 'opportunity_status', 'outbound', 'Outbound', 30, now(), now()),
('opt_opportunity_status_in_discussion', 'opportunity_status', 'in_discussion', 'In Discussion', 40, now(), now()),
('opt_opportunity_status_completed', 'opportunity_status', 'completed', 'Completed', 50, now(), now()),
('opt_opportunity_status_passed', 'opportunity_status', 'passed', 'Passed', 60, now(), now()),
('opt_opportunity_status_archived', 'opportunity_status', 'archived', 'Archived', 70, now(), now()),
('opt_location_relationship_based_in', 'location_relationship', 'based_in', 'Based In', 0, now(), now()),
('opt_location_relationship_hometown', 'location_relationship', 'hometown', 'Hometown', 10, now(), now()),
('opt_location_relationship_born_in', 'location_relationship', 'born_in', 'Born In', 20, now(), now()),
('opt_location_relationship_frequently_works_in', 'location_relationship', 'frequently_works_in', 'Frequently Works In', 30, now(), now()),
('opt_location_relationship_other', 'location_relationship', 'other', 'Other', 40, now(), now()),
('opt_source_type_public', 'source_type', 'public', 'Public', 0, now(), now()),
('opt_source_type_representative', 'source_type', 'representative', 'Representative', 10, now(), now()),
('opt_source_type_internal_conversation', 'source_type', 'internal_conversation', 'Internal Conversation', 20, now(), now()),
('opt_source_type_research', 'source_type', 'research', 'Research', 30, now(), now()),
('opt_source_type_social_content', 'source_type', 'social_content', 'Social Content', 40, now(), now()),
('opt_source_type_official_page', 'source_type', 'official_page', 'Official Page', 50, now(), now()),
('opt_source_type_other', 'source_type', 'other', 'Other', 60, now(), now()),
('opt_creator_status_active', 'creator_status', 'active', 'Active', 0, now(), now()),
('opt_creator_status_watch', 'creator_status', 'watch', 'Watch', 10, now(), now()),
('opt_creator_status_priority', 'creator_status', 'priority', 'Priority', 20, now(), now()),
('opt_creator_status_archived', 'creator_status', 'archived', 'Archived', 30, now(), now()),
('opt_channel_status_prospect', 'channel_status', 'prospect', 'Prospect', 0, now(), now()),
('opt_channel_status_in_talks', 'channel_status', 'in_talks', 'In Talks', 10, now(), now()),
('opt_channel_status_signed', 'channel_status', 'signed', 'Signed', 20, now(), now()),
('opt_channel_status_building', 'channel_status', 'building', 'Building', 30, now(), now()),
('opt_channel_status_live', 'channel_status', 'live', 'Live', 40, now(), now()),
('opt_channel_status_paused', 'channel_status', 'paused', 'Paused', 50, now(), now()),
('opt_channel_status_ended', 'channel_status', 'ended', 'Ended', 60, now(), now()),
('opt_channel_status_archived', 'channel_status', 'archived', 'Archived', 70, now(), now()),
('opt_channel_idea_status_idea', 'channel_idea_status', 'idea', 'Idea', 0, now(), now()),
('opt_channel_idea_status_planned', 'channel_idea_status', 'planned', 'Planned', 10, now(), now()),
('opt_channel_idea_status_filming', 'channel_idea_status', 'filming', 'Filming', 20, now(), now()),
('opt_channel_idea_status_published', 'channel_idea_status', 'published', 'Published', 30, now(), now()),
('opt_channel_idea_status_dropped', 'channel_idea_status', 'dropped', 'Dropped', 40, now(), now()),
('opt_format_org_relationship_target', 'format_org_relationship', 'target', 'Target Buyer', 0, now(), now()),
('opt_format_org_relationship_sponsor_target', 'format_org_relationship', 'sponsor_target', 'Sponsor Target', 10, now(), now()),
('opt_format_org_relationship_partner', 'format_org_relationship', 'partner', 'Partner', 20, now(), now()),
('opt_format_org_relationship_associated', 'format_org_relationship', 'associated', 'Associated', 30, now(), now()),
('opt_channel_org_relationship_production_partner', 'channel_org_relationship', 'production_partner', 'Production Partner', 0, now(), now()),
('opt_channel_org_relationship_management', 'channel_org_relationship', 'management', 'Management', 10, now(), now()),
('opt_channel_org_relationship_network', 'channel_org_relationship', 'network', 'MCN / Network', 20, now(), now()),
('opt_channel_org_relationship_brand', 'channel_org_relationship', 'brand', 'Brand Partner', 30, now(), now()),
('opt_channel_org_relationship_platform', 'channel_org_relationship', 'platform', 'Platform', 40, now(), now()),
('opt_channel_org_relationship_partner', 'channel_org_relationship', 'partner', 'Partner', 50, now(), now()),
('opt_channel_person_relationship_contact', 'channel_person_relationship', 'contact', 'Contact', 0, now(), now()),
('opt_channel_person_relationship_manager', 'channel_person_relationship', 'manager', 'Manager', 10, now(), now()),
('opt_channel_person_relationship_agent', 'channel_person_relationship', 'agent', 'Agent', 20, now(), now()),
('opt_channel_person_relationship_producer', 'channel_person_relationship', 'producer', 'Producer', 30, now(), now()),
('opt_channel_person_relationship_editor', 'channel_person_relationship', 'editor', 'Editor', 40, now(), now()),
('opt_channel_person_relationship_partner_manager', 'channel_person_relationship', 'partner_manager', 'Platform Partner Manager', 50, now(), now()),
('opt_opportunity_candidate_status_candidate', 'opportunity_candidate_status', 'candidate', 'Candidate', 0, now(), now()),
('opt_opportunity_candidate_status_shortlist', 'opportunity_candidate_status', 'shortlist', 'Shortlist', 10, now(), now()),
('opt_opportunity_candidate_status_contacted', 'opportunity_candidate_status', 'contacted', 'Contacted', 20, now(), now()),
('opt_opportunity_candidate_status_passed', 'opportunity_candidate_status', 'passed', 'Passed', 30, now(), now()),
('opt_deal_status_prospect', 'deal_status', 'prospect', 'Prospect', 0, now(), now()),
('opt_deal_status_in_conversation', 'deal_status', 'in_conversation', 'In Conversation', 10, now(), now()),
('opt_deal_status_signed', 'deal_status', 'signed', 'Signed', 20, now(), now()),
('opt_deal_status_passed', 'deal_status', 'passed', 'Passed', 30, now(), now()),
('opt_deal_status_dormant', 'deal_status', 'dormant', 'Dormant', 40, now(), now()),
('opt_availability_available', 'availability', 'available', 'Available', 0, now(), now()),
('opt_availability_limited', 'availability', 'limited', 'Limited', 10, now(), now()),
('opt_availability_unavailable', 'availability', 'unavailable', 'Unavailable', 20, now(), now()),
('opt_availability_unknown', 'availability', 'unknown', 'Unknown', 30, now(), now()),
('opt_stage_idea', 'stage', 'idea', 'Idea', 0, now(), now()),
('opt_stage_one_sheet', 'stage', 'one_sheet', 'One-sheet', 10, now(), now()),
('opt_stage_deck_sizzle', 'stage', 'deck_sizzle', 'Deck / Sizzle', 20, now(), now()),
('opt_stage_pitching', 'stage', 'pitching', 'Pitching', 30, now(), now()),
('opt_stage_in_development', 'stage', 'in_development', 'In development', 40, now(), now()),
('opt_stage_pilot', 'stage', 'pilot', 'Pilot', 50, now(), now()),
('opt_stage_greenlit', 'stage', 'greenlit', 'Greenlit', 60, now(), now()),
('opt_stage_in_production', 'stage', 'in_production', 'In production', 70, now(), now()),
('opt_stage_delivered', 'stage', 'delivered', 'Delivered', 80, now(), now()),
('opt_stage_released', 'stage', 'released', 'Released', 90, now(), now()),
('opt_stage_on_hold', 'stage', 'on_hold', 'On hold', 100, now(), now()),
('opt_stage_passed', 'stage', 'passed', 'Passed', 110, now(), now()),
('opt_stage_dead', 'stage', 'dead', 'Dead', 120, now(), now()),
('opt_opportunity_source_inbound', 'opportunity_source', 'inbound', 'Inbound', 0, now(), now()),
('opt_opportunity_source_outbound', 'opportunity_source', 'outbound', 'Outbound', 10, now(), now()),
('opt_opportunity_source_referral', 'opportunity_source', 'referral', 'Referral', 20, now(), now()),
('opt_opportunity_source_agency', 'opportunity_source', 'agency', 'Agency', 30, now(), now()),
('opt_opportunity_source_event', 'opportunity_source', 'event', 'Event', 40, now(), now()),
('opt_opportunity_source_other', 'opportunity_source', 'other', 'Other', 50, now(), now()),
('opt_genre_comedy', 'genre', 'comedy', 'Comedy', 0, now(), now()),
('opt_genre_drama', 'genre', 'drama', 'Drama', 10, now(), now()),
('opt_genre_sports', 'genre', 'sports', 'Sports', 20, now(), now()),
('opt_genre_documentary', 'genre', 'documentary', 'Documentary', 30, now(), now()),
('opt_genre_competition', 'genre', 'competition', 'Competition', 40, now(), now()),
('opt_genre_lifestyle', 'genre', 'lifestyle', 'Lifestyle', 50, now(), now()),
('opt_genre_food', 'genre', 'food', 'Food', 60, now(), now()),
('opt_genre_music', 'genre', 'music', 'Music', 70, now(), now()),
('opt_genre_true_crime', 'genre', 'true_crime', 'True Crime', 80, now(), now()),
('opt_genre_kids_family', 'genre', 'kids_family', 'Kids & Family', 90, now(), now()),
('opt_genre_other', 'genre', 'other', 'Other', 100, now(), now())
ON CONFLICT ("setKey", "value") DO NOTHING;

-- Domain fields from the refresh brief, as custom fields (Settings → Fields).
INSERT INTO "FieldDefinition" ("id", "recordType", "key", "name", "type", "optionSetKey", "relationType", "required", "position", "indexed", "showInNeedsAttention", "createdAt", "updatedAt") VALUES
('fd_creator_deal_status', 'creator', 'deal_status', 'Deal status', 'select', 'deal_status', NULL, false, 10, true, false, now(), now()),
('fd_creator_availability', 'creator', 'availability', 'Availability', 'select', 'availability', NULL, false, 20, false, false, now(), now()),
('fd_creator_rate_notes', 'creator', 'rate_notes', 'Rate / fee notes', 'longtext', NULL, NULL, false, 30, false, false, now(), now()),
('fd_creator_exclusivity_end', 'creator', 'exclusivity_end', 'Holding / exclusivity ends', 'date', NULL, NULL, false, 40, true, true, now(), now()),
('fd_project_stage', 'project', 'stage', 'Stage', 'select', 'stage', NULL, false, 10, true, false, now(), now()),
('fd_project_genre', 'project', 'genre', 'Genre', 'select', 'genre', NULL, false, 20, false, false, now(), now()),
('fd_project_buyer_partner', 'project', 'buyer_partner', 'Buyer / partner', 'text', NULL, NULL, false, 30, false, false, now(), now()),
('fd_project_pass_reason', 'project', 'pass_reason', 'Pass reason', 'text', NULL, NULL, false, 40, false, false, now(), now()),
('fd_project_one_sheet_url', 'project', 'one_sheet_url', 'One-sheet', 'url', NULL, NULL, false, 50, false, false, now(), now()),
('fd_project_deck_url', 'project', 'deck_url', 'Deck', 'url', NULL, NULL, false, 60, false, false, now(), now()),
('fd_project_sizzle_url', 'project', 'sizzle_url', 'Sizzle', 'url', NULL, NULL, false, 70, false, false, now(), now()),
('fd_format_stage', 'format', 'stage', 'Stage', 'select', 'stage', NULL, false, 10, true, false, now(), now()),
('fd_format_genre', 'format', 'genre', 'Genre', 'select', 'genre', NULL, false, 20, false, false, now(), now()),
('fd_format_buyer_partner', 'format', 'buyer_partner', 'Buyer / partner', 'text', NULL, NULL, false, 30, false, false, now(), now()),
('fd_format_pass_reason', 'format', 'pass_reason', 'Pass reason', 'text', NULL, NULL, false, 40, false, false, now(), now()),
('fd_format_one_sheet_url', 'format', 'one_sheet_url', 'One-sheet', 'url', NULL, NULL, false, 50, false, false, now(), now()),
('fd_format_deck_url', 'format', 'deck_url', 'Deck', 'url', NULL, NULL, false, 60, false, false, now(), now()),
('fd_format_sizzle_url', 'format', 'sizzle_url', 'Sizzle', 'url', NULL, NULL, false, 70, false, false, now(), now()),
('fd_organization_last_interaction', 'organization', 'last_interaction', 'Last interaction', 'date', NULL, NULL, false, 10, false, false, now(), now()),
('fd_opportunity_stage', 'opportunity', 'stage', 'Stage', 'select', 'stage', NULL, false, 10, true, false, now(), now()),
('fd_opportunity_source', 'opportunity', 'source', 'Source', 'select', 'opportunity_source', NULL, false, 20, false, false, now(), now()),
('fd_opportunity_contact', 'opportunity', 'contact', 'Contact', 'relation', NULL, 'person', false, 30, false, false, now(), now()),
('fd_opportunity_value_notes', 'opportunity', 'value_notes', 'Value / rate', 'text', NULL, NULL, false, 40, false, false, now(), now()),
('fd_opportunity_next_step', 'opportunity', 'next_step', 'Next step', 'text', NULL, NULL, false, 50, false, false, now(), now()),
('fd_opportunity_follow_up_date', 'opportunity', 'follow_up_date', 'Follow-up date', 'date', NULL, NULL, false, 60, true, true, now(), now()),
('fd_opportunity_outcome_reason', 'opportunity', 'outcome_reason', 'Outcome reason', 'text', NULL, NULL, false, 70, false, false, now(), now())
ON CONFLICT ("recordType", "key") DO NOTHING;

-- Expression indexes for the fields marked indexed.
CREATE INDEX IF NOT EXISTS "Creator_custom_deal_status_idx" ON "Creator" (("custom"->>'deal_status'));
CREATE INDEX IF NOT EXISTS "Creator_custom_exclusivity_end_idx" ON "Creator" (("custom"->>'exclusivity_end'));
CREATE INDEX IF NOT EXISTS "Project_custom_stage_idx" ON "Project" (("custom"->>'stage'));
CREATE INDEX IF NOT EXISTS "Format_custom_stage_idx" ON "Format" (("custom"->>'stage'));
CREATE INDEX IF NOT EXISTS "Opportunity_custom_stage_idx" ON "Opportunity" (("custom"->>'stage'));
CREATE INDEX IF NOT EXISTS "Opportunity_custom_follow_up_date_idx" ON "Opportunity" (("custom"->>'follow_up_date'));

-- Backfill verification from the talent/project column that already existed.
UPDATE "Creator" SET "verifiedAt" = "lastVerifiedAt" WHERE "verifiedAt" IS NULL AND "lastVerifiedAt" IS NOT NULL;
UPDATE "Project" SET "verifiedAt" = "lastVerifiedAt" WHERE "verifiedAt" IS NULL AND "lastVerifiedAt" IS NOT NULL;

-- Backfill owners from whoever created each record, where history knows.
UPDATE "Creator" c SET "ownerId" = a."userId" FROM (SELECT DISTINCT ON ("targetId") "targetId", "userId" FROM "AuditLog" WHERE "targetType" = 'creator' AND action = 'created' AND "userId" IS NOT NULL ORDER BY "targetId", "createdAt") a
  WHERE a."targetId" = c.id AND c."ownerId" IS NULL AND EXISTS (SELECT 1 FROM "User" u WHERE u.id = a."userId");
UPDATE "Project" c SET "ownerId" = a."userId" FROM (SELECT DISTINCT ON ("targetId") "targetId", "userId" FROM "AuditLog" WHERE "targetType" = 'project' AND action = 'created' AND "userId" IS NOT NULL ORDER BY "targetId", "createdAt") a
  WHERE a."targetId" = c.id AND c."ownerId" IS NULL AND EXISTS (SELECT 1 FROM "User" u WHERE u.id = a."userId");
UPDATE "Organization" c SET "ownerId" = a."userId" FROM (SELECT DISTINCT ON ("targetId") "targetId", "userId" FROM "AuditLog" WHERE "targetType" = 'organization' AND action = 'created' AND "userId" IS NOT NULL ORDER BY "targetId", "createdAt") a
  WHERE a."targetId" = c.id AND c."ownerId" IS NULL AND EXISTS (SELECT 1 FROM "User" u WHERE u.id = a."userId");
UPDATE "IndustryPerson" c SET "ownerId" = a."userId" FROM (SELECT DISTINCT ON ("targetId") "targetId", "userId" FROM "AuditLog" WHERE "targetType" = 'person' AND action = 'created' AND "userId" IS NOT NULL ORDER BY "targetId", "createdAt") a
  WHERE a."targetId" = c.id AND c."ownerId" IS NULL AND EXISTS (SELECT 1 FROM "User" u WHERE u.id = a."userId");
UPDATE "Format" c SET "ownerId" = a."userId" FROM (SELECT DISTINCT ON ("targetId") "targetId", "userId" FROM "AuditLog" WHERE "targetType" = 'format' AND action = 'created' AND "userId" IS NOT NULL ORDER BY "targetId", "createdAt") a
  WHERE a."targetId" = c.id AND c."ownerId" IS NULL AND EXISTS (SELECT 1 FROM "User" u WHERE u.id = a."userId");
UPDATE "Opportunity" c SET "ownerId" = a."userId" FROM (SELECT DISTINCT ON ("targetId") "targetId", "userId" FROM "AuditLog" WHERE "targetType" = 'opportunity' AND action = 'created' AND "userId" IS NOT NULL ORDER BY "targetId", "createdAt") a
  WHERE a."targetId" = c.id AND c."ownerId" IS NULL AND EXISTS (SELECT 1 FROM "User" u WHERE u.id = a."userId");
UPDATE "Channel" c SET "ownerId" = a."userId" FROM (SELECT DISTINCT ON ("targetId") "targetId", "userId" FROM "AuditLog" WHERE "targetType" = 'channel' AND action = 'created' AND "userId" IS NOT NULL ORDER BY "targetId", "createdAt") a
  WHERE a."targetId" = c.id AND c."ownerId" IS NULL AND EXISTS (SELECT 1 FROM "User" u WHERE u.id = a."userId");

-- Backfill the merged-into pointer from the settings rows Phase 2 wrote.
UPDATE "Creator" r SET "mergedInto" = s.value->>'into' FROM "AppSetting" s WHERE s.key = 'merged:creator:' || r.id AND r."mergedInto" IS NULL;
UPDATE "Project" r SET "mergedInto" = s.value->>'into' FROM "AppSetting" s WHERE s.key = 'merged:project:' || r.id AND r."mergedInto" IS NULL;
UPDATE "Organization" r SET "mergedInto" = s.value->>'into' FROM "AppSetting" s WHERE s.key = 'merged:organization:' || r.id AND r."mergedInto" IS NULL;
UPDATE "IndustryPerson" r SET "mergedInto" = s.value->>'into' FROM "AppSetting" s WHERE s.key = 'merged:person:' || r.id AND r."mergedInto" IS NULL;
UPDATE "Format" r SET "mergedInto" = s.value->>'into' FROM "AppSetting" s WHERE s.key = 'merged:format:' || r.id AND r."mergedInto" IS NULL;
UPDATE "Opportunity" r SET "mergedInto" = s.value->>'into' FROM "AppSetting" s WHERE s.key = 'merged:opportunity:' || r.id AND r."mergedInto" IS NULL;
