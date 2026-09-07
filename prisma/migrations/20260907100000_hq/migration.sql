-- CreateTable
CREATE TABLE "HqSettings" (
    "ownerId" TEXT NOT NULL,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiDailyCapCents" INTEGER NOT NULL DEFAULT 200,
    "styleGuide" TEXT,
    "briefPrefs" JSONB,
    "seededAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqSettings_pkey" PRIMARY KEY ("ownerId")
);

-- CreateTable
CREATE TABLE "HqConnection" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountEmail" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'connected',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqRelationship" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "personType" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'warm',
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "howWeMet" TEXT,
    "notes" TEXT,
    "opportunities" TEXT,
    "lastContactAt" TIMESTAMP(3),
    "nextTouchAt" TIMESTAMP(3),
    "cadenceDays" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqInteraction" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL DEFAULT 'note',
    "summary" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqPipeline" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "title" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'idea',
    "heat" INTEGER NOT NULL DEFAULT 2,
    "whyItMatters" TEXT,
    "nextStep" TEXT,
    "nextStepDue" TIMESTAMP(3),
    "lastContactAt" TIMESTAMP(3),
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqPipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqPipelineContact" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'other',
    "note" TEXT,

    CONSTRAINT "HqPipelineContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqTask" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'task',
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" INTEGER NOT NULL DEFAULT 2,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "relationshipId" TEXT,
    "pipelineId" TEXT,
    "linkTargetType" TEXT,
    "linkTargetId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqEvent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "notes" TEXT,
    "attendees" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL DEFAULT 'manual',
    "externalId" TEXT,
    "calendarId" TEXT,
    "relationshipId" TEXT,
    "pipelineId" TEXT,
    "linkTargetType" TEXT,
    "linkTargetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqNote" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'note',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "relationshipId" TEXT,
    "pipelineId" TEXT,
    "linkTargetType" TEXT,
    "linkTargetId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqIdea" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'idea',
    "status" TEXT NOT NULL DEFAULT 'spark',
    "rating" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "promotedToType" TEXT,
    "promotedToId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "lastTouchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqStyleExample" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqStyleExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqAiUsage" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqAiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HqConnection_ownerId_provider_key" ON "HqConnection"("ownerId", "provider");

-- CreateIndex
CREATE INDEX "HqRelationship_ownerId_tier_idx" ON "HqRelationship"("ownerId", "tier");

-- CreateIndex
CREATE INDEX "HqRelationship_ownerId_nextTouchAt_idx" ON "HqRelationship"("ownerId", "nextTouchAt");

-- CreateIndex
CREATE UNIQUE INDEX "HqRelationship_ownerId_personType_personId_key" ON "HqRelationship"("ownerId", "personType", "personId");

-- CreateIndex
CREATE INDEX "HqInteraction_relationshipId_at_idx" ON "HqInteraction"("relationshipId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "HqInteraction_ownerId_source_externalId_key" ON "HqInteraction"("ownerId", "source", "externalId");

-- CreateIndex
CREATE INDEX "HqPipeline_ownerId_stage_idx" ON "HqPipeline"("ownerId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "HqPipeline_ownerId_targetType_targetId_key" ON "HqPipeline"("ownerId", "targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "HqPipelineContact_pipelineId_relationshipId_key" ON "HqPipelineContact"("pipelineId", "relationshipId");

-- CreateIndex
CREATE INDEX "HqTask_ownerId_status_dueAt_idx" ON "HqTask"("ownerId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "HqEvent_ownerId_startsAt_idx" ON "HqEvent"("ownerId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "HqEvent_ownerId_source_externalId_key" ON "HqEvent"("ownerId", "source", "externalId");

-- CreateIndex
CREATE INDEX "HqNote_ownerId_updatedAt_idx" ON "HqNote"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "HqIdea_ownerId_status_lastTouchedAt_idx" ON "HqIdea"("ownerId", "status", "lastTouchedAt");

-- CreateIndex
CREATE INDEX "HqAiUsage_ownerId_createdAt_idx" ON "HqAiUsage"("ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "HqInteraction" ADD CONSTRAINT "HqInteraction_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "HqRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqPipelineContact" ADD CONSTRAINT "HqPipelineContact_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "HqPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqPipelineContact" ADD CONSTRAINT "HqPipelineContact_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "HqRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqTask" ADD CONSTRAINT "HqTask_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "HqRelationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqTask" ADD CONSTRAINT "HqTask_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "HqPipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqEvent" ADD CONSTRAINT "HqEvent_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "HqRelationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqEvent" ADD CONSTRAINT "HqEvent_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "HqPipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqNote" ADD CONSTRAINT "HqNote_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "HqRelationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqNote" ADD CONSTRAINT "HqNote_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "HqPipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Full-text search over the brain. Expression indexes, so the query side
-- uses the same expression and no stored column has to be kept in step.
CREATE INDEX "HqNote_fts_idx" ON "HqNote" USING GIN (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("body", '')));
CREATE INDEX "HqIdea_fts_idx" ON "HqIdea" USING GIN (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("body", '')));
CREATE INDEX "HqTask_fts_idx" ON "HqTask" USING GIN (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("notes", '')));
CREATE INDEX "HqInteraction_fts_idx" ON "HqInteraction" USING GIN (to_tsvector('english', coalesce("summary", '')));
CREATE INDEX "HqRelationship_fts_idx" ON "HqRelationship" USING GIN (to_tsvector('english', coalesce("name", '') || ' ' || coalesce("notes", '') || ' ' || coalesce("opportunities", '') || ' ' || coalesce("howWeMet", '')));
CREATE INDEX "HqPipeline_fts_idx" ON "HqPipeline" USING GIN (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("whyItMatters", '') || ' ' || coalesce("nextStep", '') || ' ' || coalesce("notes", '')));
CREATE INDEX "HqStyleExample_fts_idx" ON "HqStyleExample" USING GIN (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("body", '')));
