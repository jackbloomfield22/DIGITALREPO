-- The athlete YouTube channels business gets its own records.
--
-- A channel is not a format and not a project: it is a thing the company
-- pitches, signs, launches and then operates, with a pipeline and numbers of
-- its own. The ideas queued for each channel are records too, because on the
-- slate they are the actual work — "doc series", "Maxey drill", "content with
-- the dogs" — rather than a paragraph of notes about it.

CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT,
    "url" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'youtube',
    "status" TEXT NOT NULL DEFAULT 'prospect',
    "creatorId" TEXT,
    "ownerId" TEXT,
    "subscribers" INTEGER,
    "totalViews" INTEGER,
    "videoCount" INTEGER,
    "countUpdatedAt" TIMESTAMP(3),
    "cadence" TEXT,
    "premise" TEXT,
    "revenueModel" TEXT,
    "notes" TEXT,
    "launchedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archivedReason" TEXT,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Channel_slug_key" ON "Channel"("slug");
CREATE INDEX "Channel_status_idx" ON "Channel"("status");
CREATE INDEX "Channel_creatorId_idx" ON "Channel"("creatorId");

ALTER TABLE "Channel" ADD CONSTRAINT "Channel_creatorId_fkey"
    FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ChannelIdea" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idea',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChannelIdea_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChannelIdea_channelId_sortOrder_idx" ON "ChannelIdea"("channelId", "sortOrder");

ALTER TABLE "ChannelIdea" ADD CONSTRAINT "ChannelIdea_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
