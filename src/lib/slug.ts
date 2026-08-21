export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

/**
 * Produce a slug not present in `taken`. Appends -2, -3, ... on collision.
 */
export function uniqueSlug(base: string, taken: Set<string>): string {
  const root = slugify(base);
  if (!taken.has(root)) return root;
  let i = 2;
  while (taken.has(`${root}-${i}`)) i++;
  return `${root}-${i}`;
}

/** Normalize a name for duplicate detection: lowercase, strip punctuation/spacing. */
export function normalizeName(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Simple token-based similarity for duplicate suggestions (0..1). */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const union = new Set([...ta, ...tb]).size;
  const jaccard = shared / union;
  // Also compare compacted strings for typo-ish closeness on short names
  const ca = na.replace(/ /g, "");
  const cb = nb.replace(/ /g, "");
  const lev = levenshtein(ca, cb);
  const levScore = 1 - lev / Math.max(ca.length, cb.length);
  return Math.max(jaccard, levScore > 0.8 ? levScore : 0);
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}
