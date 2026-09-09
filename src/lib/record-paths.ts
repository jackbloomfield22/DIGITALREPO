// Which URL prefix belongs to which kind of record. Shared by the stepper
// (client) and the neighbour lookup (server), so keep it free of server code.

export type SteppableType = "creator" | "format" | "project" | "organization" | "person" | "opportunity" | "channel";

export const RECORD_PATHS: Record<SteppableType, string> = {
  creator: "/talent",
  format: "/formats",
  project: "/projects",
  organization: "/organizations",
  person: "/people",
  opportunity: "/opportunities",
  channel: "/youtube",
};

/** Sub-paths under a prefix that are pages of their own, not records. */
const NOT_RECORDS = new Set(["new", "channels", "ideas", "import", "edit"]);

/** The record type a pathname points at, or null for lists and other pages. */
export function recordTypeOf(pathname: string): SteppableType | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || NOT_RECORDS.has(parts[1])) return null;
  const prefix = `/${parts[0]}`;
  return (Object.keys(RECORD_PATHS) as SteppableType[]).find((t) => RECORD_PATHS[t] === prefix) ?? null;
}
