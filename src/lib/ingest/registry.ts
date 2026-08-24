// The ingest registry: the single description of what the AI layer may read
// and write. The model-facing op schema, zod validation, the Knowledge Digest
// generator, and the review-UI grouping all derive from this file. Adding a
// new record type to the site means adding one entry here (a coverage test
// fails otherwise).

import {
  CREATOR_ORG_RELATIONSHIPS,
  CREATOR_PERSON_RELATIONSHIPS,
  CREATOR_RELATIONSHIPS,
  CREATOR_STATUSES,
  FORMAT_STATUSES,
  FORMAT_TYPES,
  LOCATION_RELATIONSHIPS,
  OPPORTUNITY_STATUSES,
  OPPORTUNITY_TYPES,
  PERSON_PROJECT_ROLES,
  PERSON_ROLE_TYPES,
  PROJECT_ORG_RELATIONSHIPS,
  PROJECT_ROLES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  type LabeledValue,
} from "@/lib/taxonomy";
import { LINK_KINDS, type LinkPayload } from "@/lib/link-schema";

export type IngestTargetType =
  | "creator"
  | "project"
  | "organization"
  | "format"
  | "person"
  | "opportunity"
  | "entity"
  | "event";

export type EditableField = {
  name: string;
  label: string;
  kind: "text" | "longtext" | "number" | "year" | "date" | "vocab";
  maxLength?: number;
  vocab?: () => LabeledValue[];
  description?: string;
};

export type RecordSpec = {
  targetType: IngestTargetType;
  prismaModel: string; // Prisma client property name
  displayName: string;
  nameField: "name" | "title";
  hasVersion: boolean;
  path: (slug: string) => string;
  /** Fields ingest may create with (nameField is always allowed/required). */
  createFields: string[];
  /** Fields ingest may update. */
  fields: EditableField[];
};

const text = (name: string, label: string, maxLength: number): EditableField => ({
  name, label, kind: "text", maxLength,
});
const longtext = (name: string, label: string): EditableField => ({
  name, label, kind: "longtext", maxLength: 8000,
});
const vocab = (name: string, label: string, source: () => LabeledValue[]): EditableField => ({
  name, label, kind: "vocab", vocab: source,
});

export const RECORD_REGISTRY: Record<IngestTargetType, RecordSpec> = {
  creator: {
    targetType: "creator",
    prismaModel: "creator",
    displayName: "Talent",
    nameField: "name",
    hasVersion: true,
    path: (slug) => `/talent/${slug}`,
    createFields: ["headline"],
    fields: [
      text("headline", "Headline", 300),
      longtext("miniBio", "Mini Bio"),
      longtext("digitalSummary", "Digital Summary"),
      longtext("opportunityNotes", "Opportunity Notes"),
      longtext("internalNotes", "Internal Notes"),
      { name: "age", label: "Age", kind: "number" },
      vocab("status", "Status", () => CREATOR_STATUSES),
    ],
  },
  project: {
    targetType: "project",
    prismaModel: "project",
    displayName: "Project",
    nameField: "title",
    hasVersion: true,
    path: (slug) => `/projects/${slug}`,
    createFields: ["projectType", "logline", "premiereYear"],
    fields: [
      text("logline", "Logline", 500),
      longtext("description", "Description"),
      longtext("internalNotes", "Internal Notes"),
      vocab("projectType", "Project Type", () => PROJECT_TYPES),
      vocab("status", "Status", () => PROJECT_STATUSES),
      { name: "premiereYear", label: "Premiere Year", kind: "year" },
      { name: "endYear", label: "End Year", kind: "year" },
      { name: "seasons", label: "Seasons", kind: "number" },
      { name: "episodes", label: "Episodes", kind: "number" },
    ],
  },
  organization: {
    targetType: "organization",
    prismaModel: "organization",
    displayName: "Organization",
    nameField: "name",
    hasVersion: true,
    path: (slug) => `/organizations/${slug}`,
    createFields: ["description"],
    fields: [
      longtext("description", "Description"),
      text("website", "Website", 500),
      text("location", "Location", 120),
      longtext("internalNotes", "Internal Notes"),
    ],
  },
  format: {
    targetType: "format",
    prismaModel: "format",
    displayName: "Format",
    nameField: "title",
    hasVersion: true,
    path: (slug) => `/formats/${slug}`,
    createFields: ["logline", "formatType"],
    fields: [
      text("logline", "Logline", 500),
      longtext("description", "Description"),
      vocab("status", "Status", () => FORMAT_STATUSES),
      vocab("formatType", "Format Type", () => FORMAT_TYPES),
      text("targetPlatform", "Target Platform", 120),
      text("episodeLength", "Episode Length", 80),
      longtext("episodeStructure", "Episode Structure"),
      longtext("sponsorFit", "Sponsor Fit"),
      longtext("notes", "Notes"),
    ],
  },
  person: {
    targetType: "person",
    prismaModel: "industryPerson",
    displayName: "Industry Person",
    nameField: "name",
    hasVersion: false,
    path: (slug) => `/people/${slug}`,
    createFields: ["title", "roleType"],
    fields: [
      text("title", "Title", 200),
      vocab("roleType", "Role Type", () => PERSON_ROLE_TYPES),
      longtext("notes", "Notes"),
    ],
  },
  opportunity: {
    targetType: "opportunity",
    prismaModel: "opportunity",
    displayName: "Opportunity",
    nameField: "title",
    hasVersion: true,
    path: (slug) => `/opportunities/${slug}`,
    createFields: ["type", "description"],
    fields: [
      longtext("description", "Description / Brief"),
      vocab("status", "Status", () => OPPORTUNITY_STATUSES),
      vocab("type", "Type", () => OPPORTUNITY_TYPES),
      text("audienceRequirements", "Audience Requirements", 2000),
      text("platformRequirements", "Platform Requirements", 2000),
      longtext("outcome", "Outcome"),
      longtext("notes", "Notes"),
    ],
  },
  entity: {
    targetType: "entity",
    prismaModel: "entity",
    displayName: "Entity",
    nameField: "name",
    hasVersion: false,
    path: () => `/explore`, // real path needs kind — built in digest.ts with the record
    createFields: [],
    fields: [longtext("description", "Description")],
  },
  event: {
    targetType: "event",
    prismaModel: "sportsEvent",
    displayName: "Sports Event",
    nameField: "title",
    hasVersion: false,
    path: () => `/calendar`,
    createFields: ["league", "location"],
    fields: [
      text("league", "League", 80),
      text("location", "Location", 200),
      longtext("notes", "Notes"),
      { name: "startDate", label: "Start Date", kind: "date" },
      { name: "endDate", label: "End Date", kind: "date" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Link specs: how each relationship kind in the link engine is expressed to
// the model (by-name references) and resolved back to the exact LinkPayload.
// Derived FROM src/lib/link-schema.ts — never redeclared; the coverage test
// fails if a kind there has no spec here.
// ---------------------------------------------------------------------------

export type LinkSpec = {
  kind: LinkPayload["kind"];
  ingest: boolean; // exposed to the model?
  a: { targetType: IngestTargetType; idField: string };
  b: { targetType: IngestTargetType; idField: string };
  roleField?: "role" | "relationship" | "status";
  roleVocab?: () => LabeledValue[];
  /** For creator_entity: constrain/describe which entity kinds make sense. */
  note?: string;
};

export const LINK_SPECS: Record<LinkPayload["kind"], LinkSpec> = {
  creator_entity: {
    kind: "creator_entity", ingest: true,
    a: { targetType: "creator", idField: "creatorId" },
    b: { targetType: "entity", idField: "entityId" },
    roleField: "relationship",
    roleVocab: () => [{ value: "", label: "(none)" }, ...LOCATION_RELATIONSHIPS],
    note: "Attach a taxonomy entity (interest, sport, location, talent category, tag). relationship only applies to locations (based_in etc.); otherwise omit.",
  },
  creator_format: {
    kind: "creator_format", ingest: true,
    a: { targetType: "creator", idField: "creatorId" },
    b: { targetType: "format", idField: "formatId" },
  },
  creator_project: {
    kind: "creator_project", ingest: true,
    a: { targetType: "creator", idField: "creatorId" },
    b: { targetType: "project", idField: "projectId" },
    roleField: "role",
    roleVocab: () => PROJECT_ROLES,
  },
  creator_org: {
    kind: "creator_org", ingest: true,
    a: { targetType: "creator", idField: "creatorId" },
    b: { targetType: "organization", idField: "organizationId" },
    roleField: "relationship",
    roleVocab: () => CREATOR_ORG_RELATIONSHIPS,
  },
  creator_person: {
    kind: "creator_person", ingest: true,
    a: { targetType: "creator", idField: "creatorId" },
    b: { targetType: "person", idField: "personId" },
    roleField: "relationship",
    roleVocab: () => CREATOR_PERSON_RELATIONSHIPS,
  },
  creator_creator: {
    kind: "creator_creator", ingest: true,
    a: { targetType: "creator", idField: "creatorAId" },
    b: { targetType: "creator", idField: "creatorBId" },
    roleField: "relationship",
    roleVocab: () => CREATOR_RELATIONSHIPS,
  },
  project_org: {
    kind: "project_org", ingest: true,
    a: { targetType: "project", idField: "projectId" },
    b: { targetType: "organization", idField: "organizationId" },
    roleField: "relationship",
    roleVocab: () => PROJECT_ORG_RELATIONSHIPS,
  },
  project_entity: {
    kind: "project_entity", ingest: true,
    a: { targetType: "project", idField: "projectId" },
    b: { targetType: "entity", idField: "entityId" },
  },
  project_person: {
    kind: "project_person", ingest: true,
    a: { targetType: "project", idField: "projectId" },
    b: { targetType: "person", idField: "personId" },
    roleField: "role",
    roleVocab: () => PERSON_PROJECT_ROLES,
  },
  format_entity: {
    kind: "format_entity", ingest: true,
    a: { targetType: "format", idField: "formatId" },
    b: { targetType: "entity", idField: "entityId" },
  },
  format_org: {
    kind: "format_org", ingest: true,
    a: { targetType: "format", idField: "formatId" },
    b: { targetType: "organization", idField: "organizationId" },
    roleField: "relationship",
    roleVocab: () => [
      { value: "target", label: "Target Buyer" },
      { value: "sponsor_target", label: "Sponsor Target" },
      { value: "partner", label: "Partner" },
      { value: "associated", label: "Associated" },
    ],
  },
  opportunity_creator: {
    kind: "opportunity_creator", ingest: true,
    a: { targetType: "opportunity", idField: "opportunityId" },
    b: { targetType: "creator", idField: "creatorId" },
    roleField: "status",
    roleVocab: () => [
      { value: "candidate", label: "Candidate" },
      { value: "shortlist", label: "Shortlist" },
      { value: "contacted", label: "Contacted" },
      { value: "passed", label: "Passed" },
    ],
  },
  opportunity_format: {
    kind: "opportunity_format", ingest: true,
    a: { targetType: "opportunity", idField: "opportunityId" },
    b: { targetType: "format", idField: "formatId" },
  },
  opportunity_project: {
    kind: "opportunity_project", ingest: true,
    a: { targetType: "opportunity", idField: "opportunityId" },
    b: { targetType: "project", idField: "projectId" },
  },
  opportunity_org: {
    kind: "opportunity_org", ingest: true,
    a: { targetType: "opportunity", idField: "opportunityId" },
    b: { targetType: "organization", idField: "organizationId" },
  },
  opportunity_entity: {
    kind: "opportunity_entity", ingest: true,
    a: { targetType: "opportunity", idField: "opportunityId" },
    b: { targetType: "entity", idField: "entityId" },
  },
  // Collections are curation, not knowledge — the model never proposes them.
  collection_item: {
    kind: "collection_item", ingest: false,
    a: { targetType: "creator", idField: "collectionId" },
    b: { targetType: "creator", idField: "targetId" },
  },
};

export const INGEST_LINK_KINDS = LINK_KINDS.filter((kind) => LINK_SPECS[kind]?.ingest);

/** Types whose Prisma model has an `archived` column (drives coverage tests). */
export const ARCHIVABLE_TARGET_TYPES: IngestTargetType[] = [
  "creator",
  "project",
  "organization",
  "format",
  "person",
  "opportunity",
];
