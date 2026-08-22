-- CreateTable
CREATE TABLE "SportsEvent" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "league" TEXT,
    "sportId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "location" TEXT,
    "notes" TEXT,
    "approximate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SportsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SportsEvent_slug_key" ON "SportsEvent"("slug");

-- CreateIndex
CREATE INDEX "SportsEvent_startDate_idx" ON "SportsEvent"("startDate");

-- AddForeignKey
ALTER TABLE "SportsEvent" ADD CONSTRAINT "SportsEvent_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
