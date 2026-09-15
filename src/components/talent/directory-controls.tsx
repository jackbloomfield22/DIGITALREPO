"use client";

import { DirectoryControls, type SavedViewVM, type DefaultView } from "@/components/directory-controls";
import type { FilterField, FilterState } from "@/lib/filters";
import { labelFor } from "@/lib/taxonomy";

const SORTS = [
  { value: "name", label: "Alphabetical" },
  { value: "added", label: "Recently added" },
  { value: "updated", label: "Recently updated" },
  { value: "audience", label: "Largest listed audience" },
  { value: "instagram", label: "Instagram following" },
  { value: "tiktok", label: "TikTok following" },
  { value: "youtube", label: "YouTube following" },
  { value: "formats", label: "Most formats" },
  { value: "projects", label: "Most projects" },
  { value: "connections", label: "Most connections" },
];
export function CreatorDirectoryControls({ total, canEdit, fields, state, names, savedViews, defaultViews }: { total: number; canEdit: boolean; fields: FilterField[]; state: FilterState; names: Record<string, string>; savedViews: SavedViewVM[]; defaultViews: DefaultView[] }) {
  return <DirectoryControls title="Talent" total={total} createHref="/talent/new" createLabel="+ Add Talent" searchPlaceholder="Search names, interests, bios, companies…" canEdit={canEdit} viewToggle section="talent" fields={fields} state={state} names={names} sorts={SORTS} savedViews={savedViews} defaultViews={defaultViews} />;
}
export function sortLabel(value: string): string { return SORTS.find((s) => s.value === value)?.label ?? labelFor(value); }
