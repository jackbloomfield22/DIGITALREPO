import "server-only";

// A changes file: proposals written outside the site — by Claude in a chat,
// from a page-by-page walk of the Repo — and loaded straight onto the review
// board without a model call. Same ops, same validation, same before/after,
// same tick-to-apply and undo as anything the ingest reader produces; the
// only difference is who wrote the proposals.
//
// The format is documented in docs/changes-file.md.

import { db } from "@/lib/db";
import { proposedOpSchema, type ProposedOp } from "@/lib/ingest/ops";
import { shapeAndStoreProposals } from "@/lib/ingest/pipeline";
import type { DigestCandidate } from "@/lib/ingest/matching";

export const CHANGES_FILE_KIND = "44forty-changes";
const MAX_CHANGES = 500;

export type ChangesFile = {
  kind: typeof CHANGES_FILE_KIND;
  version: number;
  /** Shown in the queue. */
  title?: string;
  /** The owner's own words the changes came from; evidence quotes highlight against it. */
  source?: string;
  changes: unknown[];
};

/** A changes file, or null if the text is not one (any other JSON is left alone). */
export function parseChangesFile(raw: string): ChangesFile | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ChangesFile> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.kind !== CHANGES_FILE_KIND || !Array.isArray(parsed.changes)) return null;
    return {
      kind: CHANGES_FILE_KIND,
      version: typeof parsed.version === "number" ? parsed.version : 1,
      title: typeof parsed.title === "string" ? parsed.title.trim().slice(0, 120) || undefined : undefined,
      source: typeof parsed.source === "string" ? parsed.source : undefined,
      changes: parsed.changes,
    };
  } catch {
    return null;
  }
}

/** Every record name the ops refer to, so they can be resolved in one query. */
function namesIn(ops: ProposedOp[]): string[] {
  const names = new Set<string>();
  for (const op of ops) {
    const o = op as unknown as Record<string, unknown>;
    for (const key of ["targetName", "aName", "bName", "aboutName", "name"]) {
      if (typeof o[key] === "string" && (o[key] as string).trim()) names.add((o[key] as string).trim());
    }
  }
  return [...names].slice(0, 400);
}

export type LoadedChanges = {
  itemId: string;
  stored: number;
  invalid: string[];
  malformed: number;
  dropped: number;
};

export async function loadChangesFile(
  userId: string,
  file: ChangesFile,
  filename: string | null,
  workspace: "youtube" | null,
): Promise<LoadedChanges> {
  const ops: ProposedOp[] = [];
  let malformed = 0;
  for (const raw of file.changes.slice(0, MAX_CHANGES)) {
    const parsed = proposedOpSchema.safeParse(raw);
    if (parsed.success) ops.push(parsed.data);
    else malformed++;
  }

  // Names resolve against the whole digest, not a similarity search: a file
  // says exactly which page it means. A live record outranks an archived
  // namesake, so the archived one is listed first and overwritten.
  const names = namesIn(ops);
  const digest = names.length
    ? await db.knowledgeDigest.findMany({
        where: { OR: names.map((n) => ({ name: { equals: n, mode: "insensitive" as const } })) },
        select: { id: true, targetType: true, targetId: true, name: true, slug: true, archived: true, summary: true },
        orderBy: { archived: "desc" },
      })
    : [];
  const candidates: DigestCandidate[] = digest.map((d) => ({ ...d, score: 1 }));

  const text = (file.source?.trim() || ops.flatMap((o) => o.evidence).join("\n")).slice(0, 200_000);
  const item = await db.ingestItem.create({
    data: {
      kind: "changes",
      filename: file.title ?? filename ?? "Changes from Claude",
      extractedText: text,
      sizeBytes: text.length,
      workspace,
      createdById: userId,
      status: "triaged",
    },
  });
  const shaped = await shapeAndStoreProposals(item.id, ops, text, candidates);
  await db.ingestItem.update({
    where: { id: item.id },
    data: {
      status: "proposed",
      metadata: {
        changesFile: {
          version: file.version,
          count: file.changes.length,
          stored: shaped.stored,
          malformed,
          invalid: shaped.invalid.slice(0, 20),
          droppedAsDuplicate: shaped.dropped,
        },
      },
    },
  });
  return { itemId: item.id, stored: shaped.stored, invalid: shaped.invalid, malformed, dropped: shaped.dropped };
}
