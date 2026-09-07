// The network. Every piece of text in HQ is scanned for the names it
// contains — your people, your pipeline cards, the Repo's records — and each
// hit becomes a link in both directions: the note knows who it is about, and
// the person's page knows every note, conversation, idea and card that names
// them. Nobody has to tag anything; the links form themselves as you write.
//
// The matcher is deliberately conservative: whole words, case-insensitive,
// longest name wins, and short or single common words never match, so
// "Will" the person does not light up every "will" in a sentence.

export type DictEntry = { name: string; aliases?: string[]; targetType: "relationship" | "pipeline" | "repo"; targetId: string; targetKind?: string };
export type MentionHit = { targetType: DictEntry["targetType"]; targetId: string; targetKind?: string; name: string };

const STOP_NAMES = new Set(["the", "and", "for", "with", "show", "series", "project", "untitled", "new", "team", "media", "sports", "digital", "golf", "football", "basketball", "baseball"]);

/** Names worth matching: two words, or one distinctive word of six letters or more. */
export function matchable(name: string): boolean {
  const n = name.trim();
  if (n.length < 4) return false;
  const words = n.split(/\s+/);
  if (words.length >= 2) return true;
  return n.length >= 6 && !STOP_NAMES.has(n.toLowerCase());
}

export function extractMentions(text: string, dictionary: DictEntry[]): MentionHit[] {
  if (!text?.trim() || !dictionary.length) return [];
  const lower = text.toLowerCase();
  const hits = new Map<string, MentionHit>();
  // Longest names first, so "Sam Rivers Productions" beats "Sam Rivers".
  const candidates = dictionary
    .flatMap((d) => [d.name, ...(d.aliases ?? [])].filter(matchable).map((n) => ({ n, d })))
    .sort((a, b) => b.n.length - a.n.length);
  const taken: [number, number][] = [];
  for (const { n, d } of candidates) {
    const needle = n.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      const end = at + needle.length;
      const before = at === 0 ? " " : lower[at - 1];
      const after = end >= lower.length ? " " : lower[end];
      const whole = !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
      const overlaps = taken.some(([s, e]) => at < e && end > s);
      if (whole && !overlaps) {
        taken.push([at, end]);
        const key = `${d.targetType}:${d.targetId}`;
        if (!hits.has(key)) hits.set(key, { targetType: d.targetType, targetId: d.targetId, targetKind: d.targetKind, name: d.name });
      }
      from = end;
    }
  }
  return [...hits.values()];
}

/** A match should not point back at the thing that was written about itself. */
export function excludeSelf(hits: MentionHit[], self: { targetType: string; targetId: string } | null): MentionHit[] {
  if (!self) return hits;
  return hits.filter((h) => !(h.targetType === self.targetType && h.targetId === self.targetId));
}
