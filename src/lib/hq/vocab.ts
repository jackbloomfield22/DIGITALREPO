// HQ vocabularies. Plain data, safe to import from client components.

export type Labeled = { value: string; label: string; hint?: string };

export const STAGES: Labeled[] = [
  { value: "idea", label: "Idea", hint: "A spark worth tracking" },
  { value: "developing", label: "Developing", hint: "Being worked into something" },
  { value: "talent_attached", label: "Talent Attached", hint: "The people are in" },
  { value: "packaging", label: "Packaging", hint: "Deck, sizzle, partners" },
  { value: "buyer_conversations", label: "Buyer Conversations", hint: "Out in the market" },
  { value: "in_negotiation", label: "In Negotiation", hint: "Terms on the table" },
  { value: "sold", label: "Sold", hint: "Done deal" },
  { value: "in_production", label: "In Production", hint: "Being made" },
  { value: "parked", label: "Parked", hint: "Paused, not dead" },
  { value: "passed", label: "Passed", hint: "Over, for now" },
];
export const ACTIVE_STAGES = ["idea", "developing", "talent_attached", "packaging", "buyer_conversations", "in_negotiation"];
export const BOARD_STAGES = [...ACTIVE_STAGES, "sold", "in_production", "parked"];

export const TIERS: Labeled[] = [
  { value: "inner", label: "Inner circle", hint: "Talk most weeks" },
  { value: "active", label: "Active", hint: "Something live between you" },
  { value: "warm", label: "Warm", hint: "Would pick up the phone" },
  { value: "cold", label: "Cold", hint: "Met once, or long ago" },
];
/** Days without contact before a tier shows as going cold. */
export const TIER_CADENCE: Record<string, number | null> = { inner: 14, active: 30, warm: 90, cold: null };

export const CONTACT_ROLES: Labeled[] = [
  { value: "decision_maker", label: "Decision maker" },
  { value: "champion", label: "Champion" },
  { value: "talent", label: "Talent" },
  { value: "rep", label: "Rep" },
  { value: "partner", label: "Partner" },
  { value: "other", label: "Involved" },
];

export const INTERACTION_KINDS: Labeled[] = [
  { value: "meeting", label: "Meeting" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "text", label: "Text" },
  { value: "intro", label: "Intro" },
  { value: "event", label: "Event" },
  { value: "note", label: "Note" },
];

export const NOTE_KINDS: Labeled[] = [
  { value: "note", label: "Note" },
  { value: "meeting", label: "Meeting notes" },
  { value: "research", label: "Research" },
  { value: "pitch", label: "Pitch" },
  { value: "talent_list", label: "Talent list" },
  { value: "template", label: "Template" },
  { value: "email_template", label: "Email template" },
];

/** What a new note of a kind starts with. Headings, not rules. */
export const NOTE_TEMPLATES: Record<string, string> = {
  meeting: "Who was there:\n\nWhat they want:\n\nWhat we said / promised:\n\nWhat surprised me:\n\nNext steps:\n- ",
  research: "Question:\n\nWhat I found:\n\nSo what:\n\nRabbit holes worth going down:\n- ",
  pitch: "Title:\n\nLogline:\n\nWhy now:\n\nThe mechanic:\n\nTalent:\n\nWho buys it and why:\n",
  talent_list: "For:\n\nNames (why each):\n- ",
  review: "",
};

export const IDEA_KINDS: Labeled[] = [
  { value: "idea", label: "Idea" },
  { value: "format_mechanic", label: "Format mechanic" },
  { value: "title", label: "Title" },
  { value: "talent_pairing", label: "Talent pairing" },
  { value: "rabbit_hole", label: "Rabbit hole" },
];
export const IDEA_STATUSES: Labeled[] = [
  { value: "spark", label: "Spark" },
  { value: "developing", label: "Developing" },
  { value: "parked", label: "Parked" },
  { value: "promoted", label: "Promoted" },
  { value: "dead", label: "Dead" },
];

export const STYLE_KINDS: Labeled[] = [
  { value: "deck", label: "Deck" },
  { value: "logline", label: "Logline" },
  { value: "talent_summary", label: "Talent summary" },
  { value: "one_sheet", label: "One-sheet" },
  { value: "exec_email", label: "Executive email" },
  { value: "other", label: "Other" },
];

export const HEAT: Labeled[] = [
  { value: "3", label: "Hot" },
  { value: "2", label: "Warm" },
  { value: "1", label: "Cool" },
];

/** "1 idea", "3 ideas". */
export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

export function hqLabel(list: Labeled[], value: string | null | undefined): string {
  if (!value) return "";
  return list.find((l) => l.value === value)?.label ?? value.replace(/_/g, " ");
}

/** A record's page in the Repo, for the link back from HQ. */
export function repoPath(targetType: string | null | undefined, slug: string | null | undefined): string | null {
  if (!targetType || !slug) return null;
  const base: Record<string, string> = {
    project: "/projects", format: "/formats", creator: "/talent", person: "/people",
    organization: "/organizations", opportunity: "/opportunities", channel: "/youtube",
  };
  return base[targetType] ? `${base[targetType]}/${slug}` : null;
}
