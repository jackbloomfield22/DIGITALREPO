// Names for the record types, usable on the client. The server-side resolver
// in record-refs.ts uses the same table.

export const RECORD_TYPE_LABEL: Record<string, string> = {
  creator: "Talent", project: "Project", organization: "Company", format: "Format", person: "Person",
  opportunity: "Opportunity", channel: "Channel", entity: "Topic", collection: "Collection", event: "Event", doc: "Document",
};
export const typeLabel = (type: string) => RECORD_TYPE_LABEL[type] ?? type;

/** Where each type's list lives. */
export const RECORD_TYPE_PATH: Record<string, string> = {
  creator: "/talent", project: "/projects", organization: "/organizations", format: "/formats", person: "/people",
  opportunity: "/opportunities", channel: "/youtube", entity: "/explore", collection: "/collections",
};
