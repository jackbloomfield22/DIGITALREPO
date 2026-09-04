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

/** The audit-log field that marks a page as having been gone over. */
export const BROUGHT_UP_TO_DATE = "brought up to date";

export function pageUpdateContext(input: {
  recordType: string;
  name: string;
  path: string;
  today: string;
}): string {
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
    "",
    'If the text says something is dead, done, over, passed, or shelved, propose the status',
    "change — and propose archiving only if they say to shelve, archive, or drop it.",
    "",
    "If it names people or companies not on the page, propose links to them, creating them",
    "when they do not exist. Unless the text says otherwise, everything in it is about",
    `"${input.name}".`,
    "",
    "Do not invent anything the text does not say. Do not change other records except to",
    "connect them to this one. Loosely worded is expected — read the intent.",
  ].join("\n");
}
