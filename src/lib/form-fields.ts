import type { FieldDef } from "@/components/record-form";
import {
  FORMAT_STATUSES,
  FORMAT_TYPES,
  OPPORTUNITY_STATUSES,
  OPPORTUNITY_TYPES,
  ORG_TYPES,
  PERSON_ROLE_TYPES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
} from "@/lib/taxonomy";

export const PROJECT_FIELDS: FieldDef[] = [
  { name: "title", label: "Title", type: "text", required: true },
  { name: "projectType", label: "Project Type", type: "select", options: PROJECT_TYPES, half: true },
  { name: "status", label: "Status", type: "select", options: PROJECT_STATUSES, half: true },
  { name: "logline", label: "Logline", type: "text" },
  { name: "description", label: "Description", type: "textarea", rows: 5 },
  { name: "premiereYear", label: "Premiere Year", type: "number", half: true },
  { name: "endYear", label: "End Year", type: "number", half: true },
  { name: "seasons", label: "Seasons", type: "number", half: true },
  { name: "episodes", label: "Episodes", type: "number", half: true },
  { name: "runtimeMinutes", label: "Runtime (minutes)", type: "number", half: true },
  { name: "country", label: "Country", type: "text", half: true },
  { name: "trailerUrl", label: "Trailer URL", type: "url", half: true },
  { name: "officialUrl", label: "Official Page URL", type: "url", half: true },
  { name: "imdbUrl", label: "IMDb URL", type: "url", half: true },
  { name: "youtubeUrl", label: "YouTube URL", type: "url", half: true },
  { name: "internalNotes", label: "Internal Notes", type: "textarea", rows: 3 },
];

export const ORGANIZATION_FIELDS: FieldDef[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "types", label: "Organization Types", type: "multicheck", options: ORG_TYPES },
  { name: "description", label: "Description", type: "textarea", rows: 4 },
  { name: "website", label: "Website", type: "url", half: true },
  { name: "location", label: "Location", type: "text", half: true },
  { name: "internalNotes", label: "Internal Notes", type: "textarea", rows: 3 },
];

export const FORMAT_FIELDS: FieldDef[] = [
  { name: "title", label: "Title", type: "text", required: true },
  { name: "formatType", label: "Format Type", type: "select", options: FORMAT_TYPES, half: true },
  { name: "status", label: "Status", type: "select", options: FORMAT_STATUSES, half: true },
  { name: "logline", label: "Logline", type: "text" },
  { name: "description", label: "Description", type: "textarea", rows: 5 },
  { name: "targetPlatform", label: "Target Platform", type: "text", half: true },
  { name: "episodeLength", label: "Episode Length", type: "text", half: true },
  { name: "episodeStructure", label: "Episode Structure", type: "textarea", rows: 3 },
  { name: "productionScale", label: "Production Scale", type: "text", half: true },
  { name: "location", label: "Location", type: "text", half: true },
  { name: "sponsorFit", label: "Sponsor Fit", type: "textarea", rows: 2 },
  { name: "notes", label: "Notes", type: "textarea", rows: 3 },
];

export const OPPORTUNITY_FIELDS: FieldDef[] = [
  { name: "title", label: "Title", type: "text", required: true },
  { name: "type", label: "Type", type: "select", options: OPPORTUNITY_TYPES, half: true },
  { name: "status", label: "Status", type: "select", options: OPPORTUNITY_STATUSES, half: true },
  { name: "description", label: "Description / Brief", type: "textarea", rows: 5 },
  { name: "audienceRequirements", label: "Audience Requirements", type: "text", half: true },
  { name: "platformRequirements", label: "Platform Requirements", type: "text", half: true },
  { name: "deadline", label: "Deadline", type: "date", half: true },
  { name: "outcome", label: "Outcome", type: "textarea", rows: 2 },
  { name: "notes", label: "Notes", type: "textarea", rows: 3 },
];

export const PERSON_FIELDS: FieldDef[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "title", label: "Title", type: "text", half: true },
  { name: "roleType", label: "Role Type", type: "select", options: PERSON_ROLE_TYPES, half: true },
  { name: "email", label: "Email", type: "text", half: true },
  { name: "phone", label: "Phone", type: "text", half: true },
  { name: "contactUrl", label: "LinkedIn / Contact URL", type: "text" },
  { name: "assistantName", label: "Assistant", type: "text", half: true },
  { name: "assistantEmail", label: "Assistant Email", type: "text", half: true },
  { name: "notes", label: "Notes", type: "textarea", rows: 3 },
];
