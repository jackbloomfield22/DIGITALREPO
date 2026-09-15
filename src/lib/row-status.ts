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
import { optionList } from "@/lib/option-cache";

export const STATUS_TYPES = ["project", "format", "opportunity", "creator", "channel"] as const;
export type StatusType = (typeof STATUS_TYPES)[number];
export type ArchiveType = StatusType | "organization" | "person";

const FALLBACK: Record<StatusType, LabeledValue[]> = {
  project: PROJECT_STATUSES,
  format: FORMAT_STATUSES,
  opportunity: OPPORTUNITY_STATUSES,
  creator: CREATOR_STATUSES,
  channel: CHANNEL_STATUSES,
};

/** The option set each status column reads from. */
export const STATUS_SET: Record<StatusType, string> = {
  project: "project_status", format: "format_status", opportunity: "opportunity_status", creator: "creator_status", channel: "channel_status",
};

export function allStatuses(type: StatusType): LabeledValue[] {
  return optionList(STATUS_SET[type], FALLBACK[type]);
}

export function statusOptionsFor(type: StatusType): LabeledValue[] {
  return allStatuses(type).filter((s) => s.value !== "archived");
}
