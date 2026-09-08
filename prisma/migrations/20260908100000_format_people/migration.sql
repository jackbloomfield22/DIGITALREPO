-- CreateTable
CREATE TABLE "FormatPerson" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "formatId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "FormatPerson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FormatPerson_formatId_idx" ON "FormatPerson"("formatId");

-- CreateIndex
CREATE UNIQUE INDEX "FormatPerson_personId_formatId_role_key" ON "FormatPerson"("personId", "formatId", "role");

-- AddForeignKey
ALTER TABLE "FormatPerson" ADD CONSTRAINT "FormatPerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "IndustryPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormatPerson" ADD CONSTRAINT "FormatPerson_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "Format"("id") ON DELETE CASCADE ON UPDATE CASCADE;

