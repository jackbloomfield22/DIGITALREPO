"use client";

import { DirectoryControls, type DirChip } from "@/components/directory-controls";
import { PROJECT_ROLES, SOCIAL_PLATFORMS, CREATOR_STATUSES, labelFor } from "@/lib/taxonomy";

const SORTS = [
  { value: "name", label: "Alphabetical" },
  { value: "added", label: "Recently Added" },
  { value: "updated", label: "Recently Updated" },
  { value: "audience", label: "Largest Listed Audience" },
  { value: "instagram", label: "Instagram Following" },
  { value: "tiktok", label: "TikTok Following" },
  { value: "youtube", label: "YouTube Following" },
  { value: "formats", label: "Most Formats" },
  { value: "projects", label: "Most Projects" },
  { value: "connections", label: "Most Connections" },
];
export type ActiveChip = DirChip;
export function CreatorDirectoryControls({ total, activeChips, canEdit }: { total: number; activeChips: ActiveChip[]; canEdit: boolean }) {
  return <DirectoryControls title="Talent" total={total} createHref="/talent/new" createLabel="+ Add Talent" searchPlaceholder="Search names, interests, bios, companies…" canEdit={canEdit} viewToggle savedViewType="talent" chips={activeChips} sorts={SORTS} filters={[
    { param: "entity", label: "Interests, sports & locations", kind: "lookup", lookupType: "entity", multiple: true },
    { param: "platform", label: "Social platform", kind: "select", options: SOCIAL_PLATFORMS },
    { param: "min", label: "Minimum followers", kind: "number", placeholder: "e.g. 300000" },
    { param: "status", label: "Talent status", kind: "select", options: CREATOR_STATUSES },
    { param: "org", label: "Organization / brand", kind: "lookup", lookupType: "organization" },
    { param: "rep", label: "Representative", kind: "lookup", lookupType: "person" },
    { param: "role", label: "Project role", kind: "select", options: PROJECT_ROLES },
    { param: "format", label: "Format", kind: "lookup", lookupType: "format", options: [{ value: "any", label: "Has a format" }, { value: "none", label: "No format yet" }] },
  ]} />;
}
export function sortLabel(value: string): string { return SORTS.find((s) => s.value === value)?.label ?? labelFor(value); }
