// Which moves between record types make sense. Kept apart from the mover so
// the op vocabulary, which runs everywhere, can name them without importing
// server code. The mover imports this too, so there is one list.

export const CONVERSIONS: Record<string, string[]> = {
  format: ["project", "channel"],
  project: ["format", "channel"],
  creator: ["person"],
  person: ["creator"],
};

export function canConvert(from: string, to: string): boolean {
  return (CONVERSIONS[from] ?? []).includes(to);
}

/** The forwarding address an old page is archived with when it is moved. */
export const MOVED_PREFIX = "Moved to ";

export function movedTo(archivedReason: string | null | undefined): string | null {
  if (!archivedReason?.startsWith(MOVED_PREFIX)) return null;
  const to = archivedReason.slice(MOVED_PREFIX.length).trim().split(/\s/)[0];
  return to.startsWith("/") ? to : null;
}
