// What a status control offers, shared by the server actions that write it and
// the row control that shows it. "archived" is deliberately absent from the
// choices: moving a record out of the way is the Archive's job, and two ways
// of saying the same thing is how records end up half-archived.

import {
  CHANNEL_STATUSES,
  CREATOR_STATUSES,
  FORMAT_STATUSES,
  OPPORTUNITY_STATUSES,
  PROJECT_STATUSES,
  type LabeledValue,
} from "@/lib/taxonomy";

export const STATUS_TYPES = ["project", "format", "opportunity", "creator", "channel"] as const;
export type StatusType = (typeof STATUS_TYPES)[number];
export type ArchiveType = StatusType | "organization" | "person";

const ALL: Record<StatusType, LabeledValue[]> = {
  project: PROJECT_STATUSES,
  format: FORMAT_STATUSES,
  opportunity: OPPORTUNITY_STATUSES,
  creator: CREATOR_STATUSES,
  channel: CHANNEL_STATUSES,
};

export function allStatuses(type: StatusType): LabeledValue[] {
  return ALL[type];
}

export function statusOptionsFor(type: StatusType): LabeledValue[] {
  return ALL[type].filter((s) => s.value !== "archived");
}
