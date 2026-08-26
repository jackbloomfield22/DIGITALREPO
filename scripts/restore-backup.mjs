// Restore a Digital Bible backup file into the database at DATABASE_URL.
//
//   DATABASE_URL="postgresql://..." node scripts/restore-backup.mjs backup.json
//
// REPLACES the current database contents with the backup. Asks for
// confirmation unless --yes is passed. The target database must already have
// the schema (run `npx prisma migrate deploy` first on an empty database).

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { PrismaClient } from "@prisma/client";

// Keep in sync with TABLE_ORDER in src/lib/backup.ts (parent-before-child).
const TABLE_ORDER = [
  "user", "entity", "sportsEvent", "creator", "socialProfile", "socialSnapshot", "project",
  "organization", "industryPerson", "format", "opportunity",
  "creatorEntityLink", "formatEntityLink", "projectEntityLink",
  "opportunityEntityLink", "creatorProjectCredit", "projectOrganization",
  "creatorOrganization", "creatorPerson", "personOrganization", "personProject",
  "creatorFormat", "formatOrganization", "creatorRelationship",
  "opportunityCreator", "opportunityFormat", "opportunityProject",
  "opportunityOrganization", "collection", "collectionItem", "savedView",
  "favorite", "recentView", "source", "recordSource", "storedFile", "attachment", "auditLog",
  "aiThread", "aiMessage", "ingestItem", "ingestChange", "doc", "docRevision", "channel", "channelIdea", "knowledgeDigest",
];

const file = process.argv[2];
if (!file) {
  console.error("Usage: DATABASE_URL=... node scripts/restore-backup.mjs <backup.json> [--yes]");
  process.exit(1);
}

const backup = JSON.parse(readFileSync(file, "utf8"));
if (backup.format !== "digital-bible-backup" || !backup.tables) {
  console.error("That file is not a Digital Bible backup.");
  process.exit(1);
}

const totalRows = Object.values(backup.tables).reduce((n, rows) => n + rows.length, 0);
console.log(`Backup from ${backup.createdAt} — ${totalRows} rows across ${Object.keys(backup.tables).length} tables.`);
console.log(`Target database: ${(process.env.DATABASE_URL ?? "").replace(/:[^:@/]+@/, ":****@")}`);

if (!process.argv.includes("--yes")) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("This REPLACES everything in the target database. Type 'restore' to continue: ");
  rl.close();
  if (answer.trim() !== "restore") {
    console.log("Aborted — nothing was changed.");
    process.exit(0);
  }
}

const db = new PrismaClient();
try {
  console.log("Clearing current data…");
  for (const table of [...TABLE_ORDER].reverse()) {
    if (db[table]) await db[table].deleteMany();
  }
  // Snapshots stored in the old database are not part of backup files.
  if (db.snapshot) await db.snapshot.deleteMany();

  console.log("Loading backup…");
  for (const table of TABLE_ORDER) {
    const rows = (backup.tables[table] ?? []).map((row) => {
      // Decode {$bytes: base64} markers written by buildBackup for Bytes columns.
      for (const [k, v] of Object.entries(row)) {
        if (v && typeof v === "object" && "$bytes" in v) row[k] = Buffer.from(v.$bytes, "base64");
      }
      return row;
    });
    if (!rows.length || !db[table]) continue;
    await db[table].createMany({ data: rows });
    console.log(`  ${table}: ${rows.length}`);
  }
  console.log("Restore complete.");
} finally {
  await db.$disconnect();
}
