// Deterministic candidate matching: pull proper-noun-ish phrases and email
// handles out of a document and find the KnowledgeDigest rows they probably
// refer to, via trigram similarity + full-text search (raw SQL), with an
// in-memory similarity fallback if the extensions are unavailable.

import { db } from "@/lib/db";
import { nameSimilarity } from "@/lib/slug";

export type DigestCandidate = {
  id: string; // digest row id — handed to the model as targetId context
  targetType: string;
  targetId: string;
  name: string;
  slug: string;
  archived: boolean;
  summary: string;
  score: number;
};

const STOP_PHRASES = new Set([
  "The", "This", "That", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
  "Saturday", "Sunday", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December", "Hi", "Hey",
  "Hello", "Thanks", "Thank", "Best", "Regards", "Subject", "From", "To", "Re",
  "Fwd", "Dear", "Ok", "Sent", "On",
]);

/** Proper-noun-ish phrases (1–4 capitalized words) + email local parts. */
export function extractCandidatePhrases(text: string, cap = 60): string[] {
  const phrases = new Map<string, number>();
  const add = (phrase: string) => {
    const clean = phrase.trim();
    if (clean.length < 3 || clean.length > 60) return;
    if (STOP_PHRASES.has(clean)) return;
    phrases.set(clean, (phrases.get(clean) ?? 0) + 1);
  };

  const properRe = /\b([A-Z][a-zA-Z'&.]+(?:\s+(?:of|for|the|and|&)?\s*[A-Z][a-zA-Z'&.0-9]+){0,3})\b/g;
  let m: RegExpExecArray | null;
  while ((m = properRe.exec(text))) add(m[1]);

  const emailRe = /\b([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+)\./g;
  while ((m = emailRe.exec(text))) {
    add(m[1].replace(/[._]/g, " "));
    add(m[2].split(".")[0]);
  }

  // Social handles: @handle
  const handleRe = /(?:^|\s)@([a-zA-Z0-9_.]{3,30})\b/g;
  while ((m = handleRe.exec(text))) add(m[1]);

  return [...phrases.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, cap)
    .map(([phrase]) => phrase);
}

type RawRow = {
  id: string; targetType: string; targetId: string; name: string; slug: string;
  archived: boolean; summary: string; sim: number;
};

async function trigramSearch(phrase: string, limit: number): Promise<RawRow[]> {
  return db.$queryRaw<RawRow[]>`
    SELECT "id", "targetType", "targetId", "name", "slug", "archived", "summary",
      GREATEST(
        similarity("name", ${phrase}),
        similarity("searchText", ${phrase}) * 0.9
      ) AS sim
    FROM "KnowledgeDigest"
    WHERE similarity("name", ${phrase}) > 0.35
       OR "searchText" % ${phrase}
       OR "searchVector" @@ plainto_tsquery('simple', ${phrase})
    ORDER BY sim DESC
    LIMIT ${limit}
  `;
}

/**
 * Match a document against the digest. Archived records are included at low
 * weight so the model can propose restoring instead of duplicating.
 */
export async function matchCandidates(
  text: string,
  opts: { maxCandidates?: number; maxChars?: number } = {},
): Promise<DigestCandidate[]> {
  const maxCandidates = opts.maxCandidates ?? 18;
  const phrases = extractCandidatePhrases(text);
  if (!phrases.length) return [];

  const scores = new Map<string, DigestCandidate>();
  const bump = (row: Omit<RawRow, "sim">, score: number) => {
    const weighted = row.archived ? score * 0.5 : score;
    const existing = scores.get(row.id);
    if (!existing || existing.score < weighted) {
      scores.set(row.id, { ...row, score: weighted });
    }
  };

  let rawAvailable = true;
  for (const phrase of phrases.slice(0, 25)) {
    if (!rawAvailable) break;
    try {
      for (const row of await trigramSearch(phrase, 5)) {
        bump(row, Number(row.sim));
      }
    } catch {
      rawAvailable = false; // pg_trgm/tsvector unavailable — fall back below
    }
  }

  if (!rawAvailable || scores.size === 0) {
    const all = await db.knowledgeDigest.findMany({
      select: { id: true, targetType: true, targetId: true, name: true, slug: true, archived: true, summary: true, aliases: true },
    });
    for (const row of all) {
      let best = 0;
      for (const phrase of phrases) {
        best = Math.max(
          best,
          nameSimilarity(row.name, phrase),
          ...row.aliases.map((a) => nameSimilarity(a, phrase)),
        );
        if (best >= 0.99) break;
      }
      if (best >= 0.6) bump(row, best);
    }
  }

  let candidates = [...scores.values()].sort((a, b) => b.score - a.score).slice(0, maxCandidates);

  // Character cap so we never blow up the prompt
  const maxChars = opts.maxChars ?? 9000;
  let used = 0;
  candidates = candidates.filter((c) => {
    used += c.summary.length + 60;
    return used <= maxChars;
  });
  return candidates;
}
