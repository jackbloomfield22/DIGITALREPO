// What a format or project looks like as an Airtable row. Pure: no database,
// no network, so the mapping can be tested on its own and read by the client.
//
// The row carries a deliberately small slice of the record — enough for the
// team to find and recognise it in Airtable, plus the files. Descriptions and
// internal notes stay in the Repo. The Repo is the source of truth and pushes
// one way; nothing typed into Airtable flows back.

export type MirrorType = "format" | "project";

export type MirrorFile = {
  id: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  airtableAttachmentId: string | null;
};

/** Everything the row is built from, loaded by the server from the record and its links. */
export type MirrorSource = {
  type: MirrorType;
  id: string;
  slug: string;
  title: string;
  status: string;
  statusLabel: string;
  kind: string | null;
  kindLabel: string | null;
  logline: string | null;
  companies: string[];
  people: string[];
  talent: string[];
  archived: boolean;
  archivedReason: string | null;
  lastActivityAt: Date | null;
  updatedAt: Date;
  files: MirrorFile[];
};

/** The columns the Repo writes. `Name` is whatever the table's primary field is called. */
export const FIELD = {
  name: "Name",
  status: "Status",
  type: "Type",
  logline: "Logline",
  companies: "Companies",
  people: "People",
  talent: "Talent",
  repoLink: "Repo link",
  repoId: "Repo ID",
  files: "Files",
  archived: "Archived",
  lastMoved: "Last moved",
  syncNote: "Sync note",
} as const;

export type AirtableFieldSpec = { name: string; type: string; options?: Record<string, unknown> };

/** The fields to create on a table that lacks them, in the shape the Airtable metadata API takes. */
export function fieldSpecs(_kind: MirrorType, choices: { statuses: string[]; types: string[] }): AirtableFieldSpec[] {
  const select = (names: string[]) => ({ choices: names.map((name) => ({ name })) });
  return [
    { name: FIELD.name, type: "singleLineText" },
    { name: FIELD.status, type: "singleSelect", options: select(choices.statuses) },
    { name: FIELD.type, type: "singleSelect", options: select(choices.types) },
    { name: FIELD.logline, type: "multilineText" },
    { name: FIELD.companies, type: "multilineText" },
    { name: FIELD.people, type: "multilineText" },
    { name: FIELD.talent, type: "multilineText" },
    { name: FIELD.files, type: "multipleAttachments" },
    { name: FIELD.repoLink, type: "url" },
    { name: FIELD.repoId, type: "singleLineText" },
    { name: FIELD.archived, type: "checkbox", options: { icon: "check", color: "greenBright" } },
    { name: FIELD.lastMoved, type: "date", options: { dateFormat: { name: "iso" } } },
    { name: FIELD.syncNote, type: "singleLineText" },
  ];
}

const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * The field payload for one record. `nameField` is the table's primary field
 * (a base the team made by hand may call it "Project" rather than "Name").
 * Files are not here: attachments are pushed separately, since they need
 * uploads rather than a value.
 */
export function buildFields(src: MirrorSource, siteOrigin: string, nameField: string = FIELD.name): Record<string, unknown> {
  const path = src.type === "format" ? "formats" : "projects";
  return {
    [nameField]: src.title,
    [FIELD.status]: src.statusLabel || null,
    [FIELD.type]: src.kindLabel || null,
    [FIELD.logline]: src.logline?.trim() || null,
    [FIELD.companies]: src.companies.join("\n") || null,
    [FIELD.people]: src.people.join("\n") || null,
    [FIELD.talent]: src.talent.join("\n") || null,
    [FIELD.repoLink]: `${siteOrigin}/${path}/${src.slug}`,
    [FIELD.repoId]: `${src.type}:${src.id}`,
    [FIELD.archived]: src.archived,
    [FIELD.lastMoved]: dateOnly(src.lastActivityAt ?? src.updatedAt),
    [FIELD.syncNote]: src.archived ? (src.archivedReason ?? "Archived in the Repo") : null,
  };
}

/** Deterministic text for hashing: keys sorted, so the same row always reads the same. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object).sort().map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Airtable's own row URL. */
export function airtableRecordUrl(baseId: string, tableId: string, recordId: string): string {
  return `https://airtable.com/${baseId}/${tableId}/${recordId}`;
}

/** The repo key written on every row, and how to read it back. */
export function parseRepoId(value: unknown): { type: MirrorType; id: string } | null {
  if (typeof value !== "string") return null;
  const [type, id] = value.split(":");
  if ((type === "format" || type === "project") && id) return { type, id };
  return null;
}
