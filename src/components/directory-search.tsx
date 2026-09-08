"use client";
import { useDirectoryQuery } from "@/components/hooks/use-directory-query";
/** Compact search for workspace tabs that already supply their own facets. */
export function DirectorySearch({ placeholder }: { placeholder: string }) {
  const { q, onSearch, update, pending } = useDirectoryQuery();
  return <form role="search" className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); update(() => {}, true); }}><input className="min-w-40 flex-1" type="search" value={q} placeholder={placeholder} aria-label={placeholder} maxLength={200} onChange={(e) => onSearch(e.target.value)} />{q && <button type="button" className="btn btn-ghost btn-sm" onClick={() => update((p) => p.delete("q"))}>Clear search</button>}<span className="text-xs text-muted" role="status">{pending ? "Updating…" : ""}</span></form>;
}
