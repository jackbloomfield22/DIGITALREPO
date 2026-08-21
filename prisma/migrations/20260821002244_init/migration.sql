-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Creator" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "headline" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "miniBio" TEXT,
    "digitalSummary" TEXT,
    "opportunityNotes" TEXT,
    "internalNotes" TEXT,
    "birthday" TIMESTAMP(3),
    "age" INTEGER,
    "lastVerifiedAt" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Creator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialProfile" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT,
    "url" TEXT,
    "followerCount" INTEGER,
    "countUpdatedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "SocialProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialSnapshot" (
    "id" TEXT NOT NULL,
    "socialProfileId" TEXT NOT NULL,
    "followerCount" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "projectType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'released',
    "logline" TEXT,
    "description" TEXT,
    "premiereYear" INTEGER,
    "endYear" INTEGER,
    "seasons" INTEGER,
    "episodes" INTEGER,
    "runtimeMinutes" INTEGER,
    "country" TEXT,
    "trailerUrl" TEXT,
    "officialUrl" TEXT,
    "imdbUrl" TEXT,
    "youtubeUrl" TEXT,
    "internalNotes" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "description" TEXT,
    "website" TEXT,
    "location" TEXT,
    "internalNotes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndustryPerson" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "roleType" TEXT,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndustryPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Format" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "logline" TEXT,
    "description" TEXT,
    "formatType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idea',
    "targetPlatform" TEXT,
    "episodeStructure" TEXT,
    "episodeLength" TEXT,
    "productionScale" TEXT,
    "location" TEXT,
    "sponsorFit" TEXT,
    "notes" TEXT,
    "ownerId" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Format_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'researching',
    "description" TEXT,
    "audienceRequirements" TEXT,
    "platformRequirements" TEXT,
    "outcome" TEXT,
    "notes" TEXT,
    "deadline" TIMESTAMP(3),
    "ownerId" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorEntityLink" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT '',
    "confidence" TEXT,
    "note" TEXT,

    CONSTRAINT "CreatorEntityLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormatEntityLink" (
    "id" TEXT NOT NULL,
    "formatId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,

    CONSTRAINT "FormatEntityLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectEntityLink" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,

    CONSTRAINT "ProjectEntityLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityEntityLink" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,

    CONSTRAINT "OpportunityEntityLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorProjectCredit" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "note" TEXT,
    "confidence" TEXT,

    CONSTRAINT "CreatorProjectCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectOrganization" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "ProjectOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorOrganization" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "status" TEXT,
    "startYear" INTEGER,
    "endYear" INTEGER,
    "note" TEXT,
    "confidence" TEXT,

    CONSTRAINT "CreatorOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorPerson" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "note" TEXT,
    "confidence" TEXT,

    CONSTRAINT "CreatorPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonOrganization" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" TEXT,
    "current" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PersonOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonProject" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "PersonProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorFormat" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "formatId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "CreatorFormat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormatOrganization" (
    "id" TEXT NOT NULL,
    "formatId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT 'associated',
    "note" TEXT,

    CONSTRAINT "FormatOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorRelationship" (
    "id" TEXT NOT NULL,
    "creatorAId" TEXT NOT NULL,
    "creatorBId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "note" TEXT,
    "confidence" TEXT,

    CONSTRAINT "CreatorRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityCreator" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "note" TEXT,

    CONSTRAINT "OpportunityCreator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityFormat" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "formatId" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "OpportunityFormat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityProject" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "OpportunityProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityOrganization" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "OpportunityOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "note" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecentView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecentView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "url" TEXT,
    "sourceType" TEXT,
    "publication" TEXT,
    "publishedAt" TIMESTAMP(3),
    "notes" TEXT,
    "addedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordSource" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "RecordSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetLabel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "results" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchInboxItem" (
    "id" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "proposal" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchInboxItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Creator_slug_key" ON "Creator"("slug");

-- CreateIndex
CREATE INDEX "Creator_name_idx" ON "Creator"("name");

-- CreateIndex
CREATE INDEX "Creator_updatedAt_idx" ON "Creator"("updatedAt");

-- CreateIndex
CREATE INDEX "SocialProfile_creatorId_idx" ON "SocialProfile"("creatorId");

-- CreateIndex
CREATE INDEX "SocialProfile_platform_idx" ON "SocialProfile"("platform");

-- CreateIndex
CREATE INDEX "SocialSnapshot_socialProfileId_idx" ON "SocialSnapshot"("socialProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "Project_title_idx" ON "Project"("title");

-- CreateIndex
CREATE INDEX "Project_projectType_idx" ON "Project"("projectType");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_name_idx" ON "Organization"("name");

-- CreateIndex
CREATE UNIQUE INDEX "IndustryPerson_slug_key" ON "IndustryPerson"("slug");

-- CreateIndex
CREATE INDEX "IndustryPerson_name_idx" ON "IndustryPerson"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Format_slug_key" ON "Format"("slug");

-- CreateIndex
CREATE INDEX "Format_title_idx" ON "Format"("title");

-- CreateIndex
CREATE INDEX "Format_status_idx" ON "Format"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_slug_key" ON "Opportunity"("slug");

-- CreateIndex
CREATE INDEX "Opportunity_status_idx" ON "Opportunity"("status");

-- CreateIndex
CREATE INDEX "Entity_name_idx" ON "Entity"("name");

-- CreateIndex
CREATE INDEX "Entity_kind_idx" ON "Entity"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_kind_slug_key" ON "Entity"("kind", "slug");

-- CreateIndex
CREATE INDEX "CreatorEntityLink_entityId_idx" ON "CreatorEntityLink"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorEntityLink_creatorId_entityId_relationship_key" ON "CreatorEntityLink"("creatorId", "entityId", "relationship");

-- CreateIndex
CREATE INDEX "FormatEntityLink_entityId_idx" ON "FormatEntityLink"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "FormatEntityLink_formatId_entityId_key" ON "FormatEntityLink"("formatId", "entityId");

-- CreateIndex
CREATE INDEX "ProjectEntityLink_entityId_idx" ON "ProjectEntityLink"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectEntityLink_projectId_entityId_key" ON "ProjectEntityLink"("projectId", "entityId");

-- CreateIndex
CREATE INDEX "OpportunityEntityLink_entityId_idx" ON "OpportunityEntityLink"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityEntityLink_opportunityId_entityId_key" ON "OpportunityEntityLink"("opportunityId", "entityId");

-- CreateIndex
CREATE INDEX "CreatorProjectCredit_projectId_idx" ON "CreatorProjectCredit"("projectId");

-- CreateIndex
CREATE INDEX "CreatorProjectCredit_role_idx" ON "CreatorProjectCredit"("role");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorProjectCredit_creatorId_projectId_role_key" ON "CreatorProjectCredit"("creatorId", "projectId", "role");

-- CreateIndex
CREATE INDEX "ProjectOrganization_organizationId_idx" ON "ProjectOrganization"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectOrganization_projectId_organizationId_relationship_key" ON "ProjectOrganization"("projectId", "organizationId", "relationship");

-- CreateIndex
CREATE INDEX "CreatorOrganization_organizationId_idx" ON "CreatorOrganization"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorOrganization_creatorId_organizationId_relationship_key" ON "CreatorOrganization"("creatorId", "organizationId", "relationship");

-- CreateIndex
CREATE INDEX "CreatorPerson_personId_idx" ON "CreatorPerson"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorPerson_creatorId_personId_relationship_key" ON "CreatorPerson"("creatorId", "personId", "relationship");

-- CreateIndex
CREATE INDEX "PersonOrganization_organizationId_idx" ON "PersonOrganization"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonOrganization_personId_organizationId_key" ON "PersonOrganization"("personId", "organizationId");

-- CreateIndex
CREATE INDEX "PersonProject_projectId_idx" ON "PersonProject"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonProject_personId_projectId_role_key" ON "PersonProject"("personId", "projectId", "role");

-- CreateIndex
CREATE INDEX "CreatorFormat_formatId_idx" ON "CreatorFormat"("formatId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorFormat_creatorId_formatId_key" ON "CreatorFormat"("creatorId", "formatId");

-- CreateIndex
CREATE INDEX "FormatOrganization_organizationId_idx" ON "FormatOrganization"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "FormatOrganization_formatId_organizationId_relationship_key" ON "FormatOrganization"("formatId", "organizationId", "relationship");

-- CreateIndex
CREATE INDEX "CreatorRelationship_creatorBId_idx" ON "CreatorRelationship"("creatorBId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorRelationship_creatorAId_creatorBId_relationship_key" ON "CreatorRelationship"("creatorAId", "creatorBId", "relationship");

-- CreateIndex
CREATE INDEX "OpportunityCreator_creatorId_idx" ON "OpportunityCreator"("creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityCreator_opportunityId_creatorId_key" ON "OpportunityCreator"("opportunityId", "creatorId");

-- CreateIndex
CREATE INDEX "OpportunityFormat_formatId_idx" ON "OpportunityFormat"("formatId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityFormat_opportunityId_formatId_key" ON "OpportunityFormat"("opportunityId", "formatId");

-- CreateIndex
CREATE INDEX "OpportunityProject_projectId_idx" ON "OpportunityProject"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityProject_opportunityId_projectId_key" ON "OpportunityProject"("opportunityId", "projectId");

-- CreateIndex
CREATE INDEX "OpportunityOrganization_organizationId_idx" ON "OpportunityOrganization"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityOrganization_opportunityId_organizationId_key" ON "OpportunityOrganization"("opportunityId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");

-- CreateIndex
CREATE INDEX "CollectionItem_targetType_targetId_idx" ON "CollectionItem"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionItem_collectionId_targetType_targetId_key" ON "CollectionItem"("collectionId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "Favorite_targetType_targetId_idx" ON "Favorite"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_targetType_targetId_key" ON "Favorite"("userId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "RecentView_userId_viewedAt_idx" ON "RecentView"("userId", "viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecentView_userId_targetType_targetId_key" ON "RecentView"("userId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "RecordSource_targetType_targetId_idx" ON "RecordSource"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordSource_sourceId_targetType_targetId_key" ON "RecordSource"("sourceId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "Attachment_targetType_targetId_idx" ON "Attachment"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AiMessage_threadId_idx" ON "AiMessage"("threadId");

-- AddForeignKey
ALTER TABLE "SocialProfile" ADD CONSTRAINT "SocialProfile_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialSnapshot" ADD CONSTRAINT "SocialSnapshot_socialProfileId_fkey" FOREIGN KEY ("socialProfileId") REFERENCES "SocialProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Format" ADD CONSTRAINT "Format_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorEntityLink" ADD CONSTRAINT "CreatorEntityLink_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorEntityLink" ADD CONSTRAINT "CreatorEntityLink_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormatEntityLink" ADD CONSTRAINT "FormatEntityLink_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "Format"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormatEntityLink" ADD CONSTRAINT "FormatEntityLink_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEntityLink" ADD CONSTRAINT "ProjectEntityLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEntityLink" ADD CONSTRAINT "ProjectEntityLink_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityEntityLink" ADD CONSTRAINT "OpportunityEntityLink_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityEntityLink" ADD CONSTRAINT "OpportunityEntityLink_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorProjectCredit" ADD CONSTRAINT "CreatorProjectCredit_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorProjectCredit" ADD CONSTRAINT "CreatorProjectCredit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectOrganization" ADD CONSTRAINT "ProjectOrganization_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectOrganization" ADD CONSTRAINT "ProjectOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorOrganization" ADD CONSTRAINT "CreatorOrganization_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorOrganization" ADD CONSTRAINT "CreatorOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorPerson" ADD CONSTRAINT "CreatorPerson_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorPerson" ADD CONSTRAINT "CreatorPerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "IndustryPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonOrganization" ADD CONSTRAINT "PersonOrganization_personId_fkey" FOREIGN KEY ("personId") REFERENCES "IndustryPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonOrganization" ADD CONSTRAINT "PersonOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonProject" ADD CONSTRAINT "PersonProject_personId_fkey" FOREIGN KEY ("personId") REFERENCES "IndustryPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonProject" ADD CONSTRAINT "PersonProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorFormat" ADD CONSTRAINT "CreatorFormat_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorFormat" ADD CONSTRAINT "CreatorFormat_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "Format"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormatOrganization" ADD CONSTRAINT "FormatOrganization_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "Format"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormatOrganization" ADD CONSTRAINT "FormatOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorRelationship" ADD CONSTRAINT "CreatorRelationship_creatorAId_fkey" FOREIGN KEY ("creatorAId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorRelationship" ADD CONSTRAINT "CreatorRelationship_creatorBId_fkey" FOREIGN KEY ("creatorBId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityCreator" ADD CONSTRAINT "OpportunityCreator_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityCreator" ADD CONSTRAINT "OpportunityCreator_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityFormat" ADD CONSTRAINT "OpportunityFormat_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityFormat" ADD CONSTRAINT "OpportunityFormat_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "Format"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityProject" ADD CONSTRAINT "OpportunityProject_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityProject" ADD CONSTRAINT "OpportunityProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityOrganization" ADD CONSTRAINT "OpportunityOrganization_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityOrganization" ADD CONSTRAINT "OpportunityOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecentView" ADD CONSTRAINT "RecentView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordSource" ADD CONSTRAINT "RecordSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiThread" ADD CONSTRAINT "AiThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AiThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchInboxItem" ADD CONSTRAINT "ResearchInboxItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
