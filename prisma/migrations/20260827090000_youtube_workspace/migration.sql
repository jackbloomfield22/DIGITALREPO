-- The YouTube section becomes a knowledge base of its own, which means the
-- things around a channel — the company cutting it, the manager to call, the
-- partner manager at YouTube — have to be records rather than a line of notes.
--
-- And ingested material can now say which part of the Repo it belongs to, so
-- a list of names read as channel material lands as channel prospects instead
-- of as films in development.

ALTER TABLE "IngestItem" ADD COLUMN "workspace" TEXT;

CREATE TABLE "ChannelOrganization" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT 'partner',
    CONSTRAINT "ChannelOrganization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChannelOrganization_channelId_organizationId_relationship_key"
    ON "ChannelOrganization"("channelId", "organizationId", "relationship");
CREATE INDEX "ChannelOrganization_organizationId_idx" ON "ChannelOrganization"("organizationId");

ALTER TABLE "ChannelOrganization" ADD CONSTRAINT "ChannelOrganization_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelOrganization" ADD CONSTRAINT "ChannelOrganization_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChannelPerson" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT 'contact',
    CONSTRAINT "ChannelPerson_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChannelPerson_channelId_personId_relationship_key"
    ON "ChannelPerson"("channelId", "personId", "relationship");
CREATE INDEX "ChannelPerson_personId_idx" ON "ChannelPerson"("personId");

ALTER TABLE "ChannelPerson" ADD CONSTRAINT "ChannelPerson_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelPerson" ADD CONSTRAINT "ChannelPerson_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "IndustryPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
