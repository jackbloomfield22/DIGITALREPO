// Rebuild every Knowledge Digest row from the live database.
//
//   npx tsx scripts/rebuild-digests.ts [--if-empty]
//
// --if-empty only rebuilds when the digest table has no rows (used by the
// Vercel build so a fresh deployment indexes itself exactly once).

import { db } from "../src/lib/db";
import { rebuildAllDigests } from "../src/lib/ingest/digest";

async function main() {
  if (process.argv.includes("--if-empty")) {
    const existing = await db.knowledgeDigest.count();
    if (existing > 0) {
      console.log(`Knowledge Digest already populated (${existing} rows) — skipping rebuild.`);
      return;
    }
  }
  const { built, removed } = await rebuildAllDigests();
  console.log(`Knowledge Digest rebuilt: ${built} rows${removed ? `, ${removed} stale removed` : ""}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
