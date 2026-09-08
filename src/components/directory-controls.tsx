"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { saveView } from "@/lib/actions/misc";
import { useToast } from "@/components/toast";
import { Modal } from "@/components/overlay";
import { useDirectoryQuery } from "@/components/hooks/use-directory-query";
import { clearDirectoryFilters, removeFilterValue } from "@/lib/directory-params";
import type { LabeledValue } from "@/lib/taxonomy";

export type FilterDef =
  | { param: string; label: string; kind: "select"; options: LabeledValue[] }
  | { param: string; label: string; kind: "number"; placeholder?: string }
  | { param: string; label: string; kind: "lookup"; lookupType: string; lookupKind?: string; multiple?: boolean; options?: LabeledValue[] };
export type DirChip = { param: string; value: string; label: string };
type LookupItem = { id: string; name: string; sub?: string };

function LookupFilter({ filter, chips, values, onPick }: {
  filter: Extract<FilterDef, { kind: "lookup" }>;
  chips: DirChip[];
  values: string[];
  onPick: (value: string) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; items: LookupItem[]; error?: boolean } | null>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ type: filter.lookupType, q: query });
      if (filter.lookupKind) params.set("kind", filter.lookupKind);
      try {
        const res = await fetch(`/api/lookup?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Lookup failed");
        const items: LookupItem[] = await res.json();
        if (!controller.signal.aborted) setResult({ query, items });
      } catch {
        if (!controller.signal.aborted) setResult({ query, items: [], error: true });
      }
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open, filter.lookupType, filter.lookupKind]);
  const ready = result?.query === query;
  const selected = chips.filter((chip) => chip.param === filter.param);
  const caption = filter.multiple ? (values.length ? `${values.length} selected` : "Choose…") : (selected[0]?.label ?? filter.options?.find((o) => values.includes(o.value))?.label ?? "Any");
  return (
    <div ref={root} className="relative min-w-0" onKeyDown={(e) => {
      if (e.key === "Escape") { e.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <label id={`${id}-label`} className="mb-1 block">{filter.label}</label>
      <button ref={trigger} type="button" aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-controls={id}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-line-strong bg-surface px-3 py-2 text-left text-sm hover:border-accent"
        onClick={() => { setOpen(!open); setQuery(""); setResult(null); }}>
        <span id={`${id}-value`} className="truncate">{caption}</span><span aria-hidden className="text-muted">⌄</span>
      </button>
      {open && <div id={id} className="absolute inset-x-0 top-full z-30 mt-1 min-w-0 rounded-md border border-line bg-surface p-2 shadow-pop">
        <input autoFocus type="search" placeholder={`Find ${filter.label.toLowerCase()}…`} aria-label={`Find ${filter.label.toLowerCase()}`} value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="mt-1 max-h-64 overflow-y-auto" role="group" aria-label={filter.label}>
          {!filter.multiple && <button type="button" className="filter-option" onClick={() => { onPick(""); setOpen(false); trigger.current?.focus(); }}>Any</button>}
          {!query && filter.options?.map((o) => <button type="button" key={o.value} className="filter-option" onClick={() => { onPick(o.value); setOpen(false); }}>{o.label}</button>)}
          {!ready ? <p className="p-2 text-sm text-muted" role="status">Loading options…</p> : result?.error ? <p className="p-2 text-sm text-muted" role="alert">Couldn’t load options. Close and reopen to retry.</p> : <>
            {result?.items.length === 0 && <p className="p-2 text-sm text-muted">No matches. Try a shorter name.</p>}
            {result?.items.map((item) => <button type="button" key={item.id} className="filter-option" aria-pressed={values.includes(item.id)} onClick={() => { onPick(item.id); if (!filter.multiple) { setOpen(false); trigger.current?.focus(); } }}>
              <span className="min-w-0 flex-1"><span className="block break-words">{item.name}</span>{item.sub && <span className="block truncate text-xs text-muted">{item.sub}</span>}</span>
              {values.includes(item.id) && <span aria-hidden>✓</span>}
            </button>)}
            {(result?.items.length ?? 0) >= 8 && <p className="px-2 pt-2 text-xs text-muted">Type to find more options.</p>}
          </>}
        </div>
        {filter.multiple && <button type="button" className="btn btn-secondary btn-sm mt-2 w-full" onClick={() => { setOpen(false); trigger.current?.focus(); }}>Done</button>}
      </div>}
    </div>
  );
}

export function DirectoryControls({ title, total, createHref, createLabel, searchPlaceholder, filters, sorts, chips, canEdit, viewToggle, savedViewType, views, headingLevel = 1 }: {
  title: string; total: number; createHref?: string; createLabel?: string;
  searchPlaceholder: string; filters: FilterDef[]; sorts: LabeledValue[];
  chips: DirChip[]; canEdit: boolean; viewToggle?: boolean; savedViewType?: string;
  views?: LabeledValue[]; headingLevel?: 1 | 2;
}) {
  const { q, onSearch, update, searchParams, pending } = useDirectoryQuery();
  const { toast } = useToast();
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const missingChips = filters.flatMap((f) => searchParams.getAll(f.param).filter((v) => !chips.some((c) => c.param === f.param && c.value === v)).map((value) => ({ param: f.param, value, label: `${f.label}: ${f.kind === "lookup" ? "selected record" : value}` })));
  const allChips = [...(searchParams.get("q") ? [{ param: "q", value: searchParams.get("q")!, label: `Search: ${searchParams.get("q")}` }] : []), ...chips.filter((c) => c.param !== "q"), ...missingChips];
  const modes = views ?? [{ value: "table", label: "List" }, { value: "cards", label: "Cards" }];
  const view = searchParams.get("view") ?? modes[0].value;
  const sort = searchParams.get("sort") ?? sorts[0]?.value;
  const setFilter = (filter: FilterDef, value: string) => update((p) => {
    if (filter.kind === "lookup" && filter.multiple) {
      if (p.getAll(filter.param).includes(value)) removeFilterValue(p, filter.param, value);
      else p.append(filter.param, value);
    } else if (value) p.set(filter.param, value); else p.delete(filter.param);
  });
  return (
    <div className="mb-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <Heading className="font-display text-3xl font-bold tracking-tight">{title}</Heading>
          <span className="rounded-full bg-wash px-2.5 py-1 text-sm tabular-nums text-muted" role="status" aria-live="polite">{pending ? "Updating…" : `${total.toLocaleString()} results`}</span>
        </div>
        {canEdit && createHref && <Link href={createHref} className="btn btn-accent">{createLabel ?? "+ Create"}</Link>}
      </div>
      <div className="rounded-lg border border-line bg-surface p-3 sm:p-4" aria-busy={pending}>
        <div className="flex flex-wrap items-center gap-2">
          <form role="search" className="min-w-48 flex-1" onSubmit={(e) => { e.preventDefault(); update(() => {}, true); }}>
            <input type="search" placeholder={searchPlaceholder} value={q} aria-label={searchPlaceholder} onChange={(e) => onSearch(e.target.value)} className="!min-h-10" />
          </form>
          {filters.length > 0 && <button type="button" className="btn btn-secondary min-h-10" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>{filtersOpen ? "Hide filters" : `Filters${chips.length ? ` (${chips.length})` : ""}`}</button>}
          {sorts.length > 0 && <select aria-label="Sort results" className="!min-h-10 !w-auto max-w-full" value={sort} onChange={(e) => update((p) => p.set("sort", e.target.value))}>
            {!sorts.some((s) => s.value === sort) && <option value={sort}>Column: {sort?.replace(/-desc$/, " ↓")}</option>}
            {sorts.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>}
          {(viewToggle || views) && <div className="flex overflow-hidden rounded-md border border-line-strong" role="group" aria-label="View mode">
            {modes.map((v) => <button type="button" key={v.value} className={`min-h-10 px-3 text-sm ${view === v.value ? "bg-ink text-paper" : "text-muted hover:bg-wash"}`} aria-pressed={view === v.value} onClick={() => update((p) => p.set("view", v.value))}>{v.label}</button>)}
          </div>}
        </div>
        {filtersOpen && filters.length > 0 && <div className="mt-3 grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2 xl:grid-cols-4">
          {filters.map((filter) => <div key={`${filter.param}-${filter.kind === "lookup" ? filter.lookupKind ?? "" : ""}`} className="min-w-0">
            {filter.kind === "lookup" ? <LookupFilter filter={filter} chips={chips} values={searchParams.getAll(filter.param)} onPick={(v) => setFilter(filter, v)} /> : <label className="block">
              <span className="mb-1 block">{filter.label}</span>
              {filter.kind === "select" ? <select className="!min-h-10" value={searchParams.get(filter.param) ?? ""} onChange={(e) => setFilter(filter, e.target.value)}>
                <option value="">Any</option>
                {filter.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select> : <input key={searchParams.get(filter.param) ?? ""} type="number" min={0} max={2147483647} className="!min-h-10" placeholder={filter.placeholder} defaultValue={searchParams.get(filter.param) ?? ""} onBlur={(e) => { if (e.target.value !== (searchParams.get(filter.param) ?? "")) setFilter(filter, e.target.value); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />}
            </label>}
          </div>)}
        </div>}
        {allChips.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {allChips.map((chip) => <button type="button" key={`${chip.param}-${chip.value}`} className="chip !min-h-8 !whitespace-normal !border-accent/30 !bg-accent-wash" aria-label={`Remove filter ${chip.label}`} onClick={() => update((p) => removeFilterValue(p, chip.param, chip.value))}>{chip.label}<span aria-hidden className="ml-1">×</span></button>)}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => update(clearDirectoryFilters)}>Clear filters</button>
          {savedViewType && <button type="button" className="btn btn-secondary btn-sm sm:ml-auto" onClick={() => setSaveOpen(true)}>Save this view</button>}
        </div>}
        {total === 0 && allChips.length > 0 && <p className="mt-3 text-sm text-muted">No matches for this combination. Remove a filter or <Link className="text-accent underline" href={`/search?q=${encodeURIComponent(searchParams.get("q") ?? "")}`}>search across the Repo</Link>.</p>}
      </div>
      {savedViewType && <p className="mt-2 text-xs text-muted"><Link href="/collections#saved-views" className="hover:text-accent hover:underline">Open saved views</Link>{filters.some((f) => f.kind === "lookup" && f.multiple) && <span> · Each selected topic narrows the results.</span>}</p>}
      <Modal open={saveOpen} onClose={() => { if (!saving) setSaveOpen(false); }} title="Save this view">
        <form onSubmit={async (e) => {
          e.preventDefault(); if (!viewName.trim() || saving) return;
          setSaving(true);
          try {
            const params = new URLSearchParams(searchParams); params.delete("page");
            const res = await saveView({ name: viewName.trim(), targetType: savedViewType!, query: params.toString() });
            if (!res.ok) throw new Error(res.error);
            toast(`Saved “${viewName.trim()}”`); setSaveOpen(false); setViewName("");
          } catch { toast("Couldn’t save this view. Please try again.", { tone: "error" }); }
          finally { setSaving(false); }
        }}>
          <label>View name<input autoFocus required maxLength={100} className="mt-1" value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="e.g. Basketball talent with YouTube" /></label>
          <p className="mt-2 text-sm text-muted">Results stay up to date. Find this view in Collections.</p>
          <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={saving} className="btn btn-secondary" onClick={() => setSaveOpen(false)}>Cancel</button><button className="btn btn-accent" disabled={saving || !viewName.trim()}>{saving ? "Saving…" : "Save view"}</button></div>
        </form>
      </Modal>
    </div>
  );
}
