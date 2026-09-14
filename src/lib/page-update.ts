// The words that turn the ingest pipeline from a cautious reader of documents
// into an instrument for correcting a page. Plain strings, shared by the client
// that sends them and the tests that check them.
//
// The pipeline's default posture is right for a forwarded email: only what the
// source says, never overwrite on a hunch, a status changes only when the
// text says so about the record. A page someone is bringing up to date needs
// the opposite posture. Everything on it was imported from two years of old
// material; what the owner types now is the truth; where they disagree, the
// page is wrong.

export const PAGE_UPDATE_LABEL = "Update — ";

/** An ingest item that came from the panel on a page, by its label. */
export function isPageUpdate(item: { filename: string | null }): boolean {
  return !!item.filename?.startsWith(PAGE_UPDATE_LABEL);
}

/** The audit-log field that marks a page as having been gone over. */
export const BROUGHT_UP_TO_DATE = "brought up to date";

/** Which pages carry an "Interests, Sports & Topics" section, and the link kind that fills it. */
export const TAG_LINK_KIND: Record<string, string> = {
  creator: "creator_entity", format: "format_entity", project: "project_entity", opportunity: "opportunity_entity",
};

export function pageUpdateContext(input: {
  /** The record's type as the database knows it (creator, format, project…). */
  targetType?: string;
  /** How the page describes itself to the reader ("format in development"). */
  recordType: string;
  name: string;
  path: string;
  today: string;
}): string {
  const tagKind = input.targetType ? TAG_LINK_KIND[input.targetType] : undefined;
  return [
    `THIS IS A STATUS OVERVIEW FROM THE OWNER OF THIS REPO, typed on the "${input.name}" page (a ${input.recordType}, ${input.path}) on ${input.today}, to bring that page up to date.`,
    "",
    "Everything currently on the page was imported from old material and may be stale or wrong.",
    "What they wrote is the current truth. Where the page and the text disagree, the page is",
    "wrong: propose updates that REPLACE the stale value — not notes beside it.",
    "",
    "Cover every field the text speaks to: status, logline or description, the people and",
    "companies involved, dates, numbers, notes. Write descriptions and notes as the complete",
    "new text, in the owner's substance but cleaned up — full sentences, no stream-of-thought.",
    "Then fill the rest of the page: every field this kind of record has that the text, the",
    "page as it stands, or plain knowledge of the subject supports — type, platform, episode",
    "structure and length, production scale, location, sponsor fit, genres. A page is found",
    "and sorted by these later, so an empty field the material could fill is a miss.",
    "",
    'If the text says something is dead, done, over, passed, or shelved, propose the status',
    "change — and propose archiving only if they say to shelve, archive, or drop it.",
    "",
    "If it names people or companies not on the page, propose links to them, creating them",
    "when they do not exist. Unless the text says otherwise, everything in it is about",
    `"${input.name}".`,
    "",
    "Every part of the page is yours to change, not only its fields:",
    "- The name: if they give a different or corrected name, propose \"rename\".",
    "- Where it lives: if they say it is in the wrong section — \"this is actually a project\",",
    "  \"he's an agent, not talent\", \"this should be under YouTube\", \"move this to formats\" —",
    "  propose \"convert\" to the right type. The page's connections and files move with it.",
    "  Put the new record's status and any other details they give in \"fields\".",
    "- Its connections: if they say a person or company is not, or is no longer, involved,",
    "  propose \"unlink\" for that connection; a connection that is wrong is removed, not archived.",
    "- The Archive: if they say it is back on, revived, or should be live, propose \"restore\".",
    "- A fresh start: if they say to redo, rewrite, or start the page over, propose the",
    "  complete new value for every field the text covers, and clear the ones it contradicts",
    "  by proposing an empty value.",
    "",
    ...(tagKind ? [
      "",
      "TAGS, EVERY TIME. The page's \"Interests, Sports & Topics\" section is how the Repo is",
      "searched and sorted, so on every update propose the tags this page should carry — drawn",
      "from what they wrote, from what the page already says, and from what you know about the",
      `subject. Each tag is a "link" with kind "${tagKind}", aName "${input.name}", bName the tag,`,
      "and entityKind one of: sport, interest, genre, location, vertical, audience_type, tag,",
      "hobby, skill, creator_category. Be specific and generous — a women's football",
      "competition set in Brazil carries sport \"Soccer\" and \"Women's soccer\", genre",
      "\"Competition\", location \"Brazil\", tag \"International\". Reuse a tag's existing",
      "name where one is listed among the records above; skip tags the page already has.",
      "Tags are the one place to go beyond the text; everything else stays to what it says.",
    ] : []),
    "",
    "Do not invent facts the text does not say (tags excepted, above). Do not change other",
    "records except to connect them to this one. Loosely worded is expected — read the intent.",
    "",
    "Keep each rationale to one short clause and each evidence quote to the few words that",
    "support the change; the owner wrote the text and does not need it explained back.",
    "One evidence quote per change, twelve words at most. Rationale eight words at most.",
    "Reply with the tool call only: no summary before it, nothing after it.",
  ].join("\n");
}

/**
 * Added to the system prompt for a page update. The base rules say never to
 * go beyond the text, which is right for a stranger's document and wrong for
 * the owner tidying their own page: here the page itself and knowledge of
 * the subject are fair game for tags and for filling empty fields.
 */
export function pageUpdateSystem(): string {
  return [
    "THIS RUN IS A PAGE UPDATE BY THE REPO'S OWNER, and two of the rules above bend for it:",
    "- Tags (link ops to entities) and empty fields may be filled from the CURRENT PAGE block",
    "  and from what you know about the subject, not only from the typed text. For such a",
    "  change, evidence is the words on the page or the fact you drew on (e.g. \"Keep Up is a",
    "  women's football competition in Brazil\"), and the rationale says \"from the page\".",
    "- The typed text may be nothing but an instruction — \"add tags\", \"fill this in\",",
    "  \"tidy this up\". Then do exactly that from the page and your knowledge. Never file a",
    "  note that merely repeats the instruction or says no facts were given; a run that",
    "  produces only such a note has failed.",
    "Facts about the world (who is attached, a status, a deal) still come only from the text.",
  ].join("\n");
}
