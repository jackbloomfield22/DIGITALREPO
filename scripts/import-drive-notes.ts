// One-shot CLI import of extracted notes into the Repo database. Reads the
// batch JSON files produced during extraction (path via IMPORT_BATCH_DIR),
// consolidates them, and loads records with links, sources, and digests.
//
//   DATABASE_URL="postgres://..." IMPORT_BATCH_DIR=/path/to/batches \
//     npx tsx scripts/import-drive-notes.ts [--dry-run]
//
// This is the command-line twin of Admin → Bulk Upload, which does the same
// work from the browser (and is the only option when the database isn't
// reachable from wherever you're running this). Both share the loader in
// src/lib/drive-import.ts, so their behaviour can't drift.
//
// Safety: takes a full snapshot before writing (unless --dry-run), and is
// idempotent — re-running enriches existing records instead of duplicating.
//
// PRIVACY: batch files contain confidential business data. They are never
// committed to the repository — this script reads them from a local directory.
//
// To turn a batch directory into a bundle for Admin → Bulk Upload:
//   npx tsx scripts/import-drive-notes.ts --bundle > bundle.json

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { db } from "../src/lib/db";
import {
  consolidateBatches,
  ensureImportSource,
  importTotals,
  runImportChunk,
  IMPORT_PHASES,
  PHASE_LABELS,
} from "../src/lib/drive-import";

const DRY = process.argv.includes("--dry-run");
const BUNDLE = process.argv.includes("--bundle");
const BATCH_DIR = process.env.IMPORT_BATCH_DIR ?? "";
const SOURCE_TITLE = process.env.IMPORT_SOURCE_TITLE ?? "4.4.Forty Notes (Google Drive import)";
const SOURCE_URL =
  process.env.IMPORT_SOURCE_URL ?? "https://drive.google.com/drive/folders/137-FbU55NRMQ8PP-R-SRkGTr0oS-rHIj";
const CHUNK = 25;

function readBatches(): unknown[] {
  if (!BATCH_DIR) throw new Error("Set IMPORT_BATCH_DIR to the batches directory.");
  return readdirSync(BATCH_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(BATCH_DIR, f), "utf8")));
}

async function main() {
  const batches = readBatches();

  // --bundle just repackages the directory for the browser uploader.
  if (BUNDLE) {
    process.stdout.write(JSON.stringify({ title: SOURCE_TITLE, url: SOURCE_URL, batches }));
    return;
  }

  const consolidated = consolidateBatches(batches);
  const totals = importTotals(consolidated);
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
  console.log(
    `Consolidated ${grandTotal} records: ` +
      IMPORT_PHASES.map((p) => `${totals[p]} ${PHASE_LABELS[p].toLowerCase()}`).join(", "),
  );

  if (DRY) {
    for (const t of consolidated.talent) console.log("TALENT:", t.name, t.types.join("/"), "|", t.sports.join(","));
    return;
  }

  const user =
    (await db.user.findUnique({ where: { email: "jackbloomfield22@gmail.com" } })) ??
    (await db.user.findFirst({ where: { role: "ADMIN" } }));
  if (!user) throw new Error("No attribution user found.");

  console.log("Taking pre-import snapshot…");
  const { createSnapshot } = await import("../src/lib/backup");
  await createSnapshot("manual", `pre-bulk-upload — ${SOURCE_TITLE}`);

  const source = await ensureImportSource(
    user.id,
    SOURCE_TITLE,
    SOURCE_URL,
    "Bulk import of extracted notes. Per-record provenance (document + as-of date) lives in each record's notes.",
  );

  let created = 0;
  let enriched = 0;
  for (const phase of IMPORT_PHASES) {
    if (!totals[phase]) continue;
    let offset: number | null = 0;
    while (offset !== null) {
      const r = await runImportChunk(consolidated, phase, offset, CHUNK, source.id);
      created += r.created;
      enriched += r.enriched;
      offset = r.nextOffset;
      process.stdout.write(`\r${PHASE_LABELS[phase]}: ${offset ?? r.total}/${r.total}   `);
    }
    process.stdout.write("\n");
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      userName: user.name,
      targetType: "source",
      targetId: source.id,
      targetLabel: source.title,
      action: "created",
      field: `bulk import — ${created} created, ${enriched} enriched`,
    },
  });

  console.log(`DONE. Created ${created} records, enriched ${enriched} existing.`);
}

main()
  .catch((e) => {
    console.error("Import failed:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
