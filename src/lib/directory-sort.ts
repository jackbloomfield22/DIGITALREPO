// Sorting for the directory list views. The chosen column lives in the URL as
// `sort=<key>` or `sort=<key>-desc`, so a sorted list can be linked, bookmarked
// and restored by the back button.

export type SortState = { key: string; desc: boolean };

export function parseSort(raw: string | undefined, fallback: string): SortState {
  const value = (raw ?? fallback) || fallback;
  return value.endsWith("-desc")
    ? { key: value.slice(0, -5), desc: true }
    : { key: value, desc: false };
}

/** The value a header link should point at: same column flips direction. */
export function nextSortValue(column: string, current: SortState): string {
  if (current.key !== column) {
    // Dates and counts are most useful largest-first on the first click.
    return DESC_FIRST.has(column) ? `${column}-desc` : column;
  }
  return current.desc ? column : `${column}-desc`;
}

const DESC_FIRST = new Set(["date", "updated", "created", "followers", "formats", "projects", "people", "year"]);

type Dir = "asc" | "desc";
const d = (s: SortState): Dir => (s.desc ? "desc" : "asc");

/**
 * Ordering for each directory. Unknown keys fall back to the directory's
 * default so a hand-edited URL can't produce an invalid query.
 */
export function orderForFormats(s: SortState): Record<string, unknown> | Record<string, unknown>[] {
  switch (s.key) {
    case "title": return { title: d(s) };
    case "status": return [{ status: d(s) }, { title: "asc" }];
    case "type": return [{ formatType: d(s) }, { title: "asc" }];
    case "date": return [{ lastActivityAt: { sort: d(s), nulls: "last" } }, { title: "asc" }];
    case "created": return { createdAt: d(s) };
    default: return { updatedAt: d(s) };
  }
}

export function orderForOpportunities(s: SortState): Record<string, unknown> | Record<string, unknown>[] {
  switch (s.key) {
    case "title": return { title: d(s) };
    case "status": return [{ status: d(s) }, { title: "asc" }];
    case "type": return [{ type: d(s) }, { title: "asc" }];
    case "date": return [{ lastActivityAt: { sort: d(s), nulls: "last" } }, { title: "asc" }];
    default: return { updatedAt: d(s) };
  }
}

export function orderForProjects(s: SortState): Record<string, unknown> | Record<string, unknown>[] {
  switch (s.key) {
    case "title": return { title: d(s) };
    case "status": return [{ status: d(s) }, { title: "asc" }];
    case "type": return [{ projectType: d(s) }, { title: "asc" }];
    case "year": return [{ premiereYear: { sort: d(s), nulls: "last" } }, { title: "asc" }];
    case "date": return [{ lastActivityAt: { sort: d(s), nulls: "last" } }, { title: "asc" }];
    default: return { updatedAt: d(s) };
  }
}

export function orderForTalent(s: SortState): Record<string, unknown> | Record<string, unknown>[] {
  switch (s.key) {
    case "name": return { name: d(s) };
    case "status": return [{ status: d(s) }, { name: "asc" }];
    case "created": return { createdAt: d(s) };
    default: return { updatedAt: d(s) };
  }
}

export function orderForOrganizations(s: SortState): Record<string, unknown> | Record<string, unknown>[] {
  switch (s.key) {
    case "name": return { name: d(s) };
    case "location": return [{ location: { sort: d(s), nulls: "last" } }, { name: "asc" }];
    case "created": return { createdAt: d(s) };
    default: return { updatedAt: d(s) };
  }
}

export function orderForPeople(s: SortState): Record<string, unknown> | Record<string, unknown>[] {
  switch (s.key) {
    case "name": return { name: d(s) };
    case "title": return [{ title: { sort: d(s), nulls: "last" } }, { name: "asc" }];
    case "role": return [{ roleType: { sort: d(s), nulls: "last" } }, { name: "asc" }];
    case "created": return { createdAt: d(s) };
    default: return { updatedAt: d(s) };
  }
}
