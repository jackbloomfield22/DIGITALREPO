// How search results are ordered. A predictable ladder rather than a score
// nobody can explain: exact name, then starts-with, then a word that starts
// with it, then contains, then acronym, then a forgiving fuzzy match — the
// same order every time for the same query. Anything that only matched by
// trigram similarity (a misspelling) or through a related record comes after,
// in similarity order. Pure, so it can be tested without a database.

import { matchSorter, rankings } from "match-sorter";

export type RankInput = {
  key: string;
  name: string;
  aliases?: string[];
  /** Trigram similarity from the index, when the row came from there. */
  sim?: number;
  /** Matched only through a related record (a company, a credit); ranks last. */
  related?: boolean;
};

const normalise = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

/** Order candidates for a query. Keeps every item; only the order changes. */
export function rankCandidates<T extends RankInput>(items: T[], query: string): T[] {
  const q = normalise(query);
  if (!q) return items;
  const prepared = items.map((it) => ({ it, name: normalise(it.name), aliases: (it.aliases ?? []).map(normalise) }));
  const tiered = matchSorter(prepared, q, {
    keys: [
      { key: "name", threshold: rankings.MATCHES },
      { key: (x) => x.aliases, threshold: rankings.MATCHES, maxRanking: rankings.STARTS_WITH },
    ],
    // Within a tier, keep the incoming order (similarity, then name) rather than alphabetical.
    baseSort: (a, b) => a.index - b.index,
  });
  const seen = new Set(tiered.map((x) => x.it.key));
  const rest = prepared.filter((x) => !seen.has(x.it.key)).sort((a, b) => {
    if (!!a.it.related !== !!b.it.related) return a.it.related ? 1 : -1;
    return (b.it.sim ?? 0) - (a.it.sim ?? 0) || a.name.localeCompare(b.name);
  });
  return [...tiered.map((x) => x.it), ...rest.map((x) => x.it)];
}

/** A closer spelling for a query with few results, when the index has one. */
export function spellingSuggestion(query: string, best: { name: string; sim: number } | null): string | null {
  if (!best || best.sim < 0.4) return null;
  return normalise(best.name) === normalise(query) ? null : best.name;
}
