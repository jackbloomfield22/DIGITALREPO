"use client";

// The head of every list: title and live count, search, Filter (with the
// applied filters as chips), sort, table/cards, density, and views — the
// built-in ones and yours, with an "unsaved changes" pill when the list no
// longer matches the view you loaded.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveView, updateSavedView } from "@/lib/actions/misc";
import { useToast } from "@/components/toast";
import { Modal } from "@/components/overlay";
import { FilterPicker } from "@/components/filter-picker";
import { useDirectoryQuery } from "@/components/hooks/use-directory-query";
import { usePrefs } from "@/components/prefs-provider";
import { applyFilterState, conditionLabel, countConditions, type FilterField, type FilterState, type LabeledValue } from "@/lib/filters";
import type { Density } from "@/lib/prefs";

export type SavedViewVM = { id: string; name: string; query: string };
export type DefaultView = { name: string; query: string };

/** The part of the URL a view is made of: everything except the page. */
function viewQuery(params: URLSearchParams): string {
  const p = new URLSearchParams(params); p.delete("page"); p.delete("v"); p.delete("all"); p.sort();
  return p.toString();
}
const normalise = (query: string) => { const p = new URLSearchParams(query); p.delete("page"); p.delete("v"); p.delete("all"); p.sort(); return p.toString(); };

export function DirectoryControls({ title, total, createHref, createLabel, searchPlaceholder, fields, state, names, sorts, canEdit, viewToggle, section, savedViews = [], defaultViews = [], headingLevel = 1, layouts }: {
  title: string; total: number; createHref?: string; createLabel?: string;
  searchPlaceholder: string; fields: FilterField[]; state: FilterState; names?: Record<string, string>;
  sorts: LabeledValue[]; canEdit: boolean; viewToggle?: boolean; section?: string;
  savedViews?: SavedViewVM[]; defaultViews?: DefaultView[]; headingLevel?: 1 | 2;
  /** Custom layouts instead of table/cards (e.g. a pipeline board). */
  layouts?: LabeledValue[];
}) {
  const { q, onSearch, update, searchParams, pending, pathname } = useDirectoryQuery();
  const { toast } = useToast();
  const router = useRouter();
  const { density, setDensity, setLayout } = usePrefs();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerField, setPickerField] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [saving, setSaving] = useState(false);
  const nameMap = useMemo(() => new Map(Object.entries(names ?? {})), [names]);
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const modes = layouts ?? [{ value: "table", label: "Table" }, { value: "cards", label: "Cards" }];
  const view = searchParams.get("view") ?? modes[0].value;
  const sort = searchParams.get("sort") ?? sorts[0]?.value;
  const loadedId = searchParams.get("v");
  const loaded = loadedId ? savedViews.find((v) => v.id === loadedId) : null;
  const current = viewQuery(searchParams);
  const dirty = loaded ? normalise(loaded.query) !== current : false;
  const activeDefault = !loaded ? defaultViews.find((d) => normalise(d.query) === current) : null;

  useEffect(() => {
    const onOpen = (e: Event) => { setPickerField((e as CustomEvent<{ field?: string }>).detail?.field ?? null); setPickerOpen(true); };
    window.addEventListener("open-filters", onOpen);
    return () => window.removeEventListener("open-filters", onOpen);
  }, []);

  const setState = (next: FilterState) => update((p) => applyFilterState(p, next, fields));
  const removeAt = (group: "and" | "or", index: number) => { const next = { and: [...state.and], or: [...state.or] }; next[group].splice(index, 1); setState(next); };
  const openView = (query: string, id?: string) => { const p = new URLSearchParams(query); if (id) p.set("v", id); router.push(`${pathname}${p.size ? `?${p}` : ""}`); };
  const count = countConditions(state);
  const chips = [
    ...(searchParams.get("q") ? [{ key: "q", label: `Search: ${searchParams.get("q")}`, remove: () => update((p) => p.delete("q")) }] : []),
    ...state.and.map((c, i) => ({ key: `and-${i}`, label: conditionLabel(c, fields, nameMap), remove: () => removeAt("and", i) })),
    ...state.or.map((c, i) => ({ key: `or-${i}`, label: `or ${conditionLabel(c, fields, nameMap)}`, remove: () => removeAt("or", i) })),
  ];

  const save = async (asNew: boolean) => {
    if (!section) return;
    setSaving(true);
    try {
      const params = new URLSearchParams(searchParams); params.delete("page"); params.delete("v"); params.delete("all");
      if (!asNew && loaded) {
        const res = await updateSavedView(loaded.id, params.toString());
        if (!res.ok) throw new Error(res.error);
        toast(`Saved “${loaded.name}”.`);
      } else {
        const res = await saveView({ name: viewName.trim(), targetType: section, query: params.toString() });
        if (!res.ok) throw new Error(res.error);
        toast(`Saved “${viewName.trim()}”.`);
        if (res.id) { params.set("v", res.id); router.replace(`${pathname}?${params}`); }
        setViewName("");
      }
      setSaveOpen(false);
      router.refresh();
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn’t save this view.", { tone: "error" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="mb-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <Heading className="font-display text-2xl font-bold tracking-tight">{title}</Heading>
          <span className="rounded-full bg-wash px-2.5 py-1 text-sm tabular-nums text-muted" role="status" aria-live="polite">{pending ? "Updating…" : `${total.toLocaleString()} ${total === 1 ? "result" : "results"}`}</span>
        </div>
        {canEdit && createHref && <Link href={createHref} className="btn btn-accent">{createLabel ?? "+ Create"} <span className="ml-1 text-[11px] opacity-70">C</span></Link>}
      </div>

      {(defaultViews.length > 0 || savedViews.length > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Views">
          {defaultViews.map((d) => <button type="button" key={d.name} role="tab" aria-selected={activeDefault?.name === d.name} className={`chip !min-h-8 ${activeDefault?.name === d.name ? "!border-ink !bg-ink !text-paper" : ""}`} onClick={() => openView(d.query)}>{d.name}</button>)}
          {savedViews.map((v) => <button type="button" key={v.id} role="tab" aria-selected={loaded?.id === v.id} className={`chip !min-h-8 ${loaded?.id === v.id ? "!border-ink !bg-ink !text-paper" : ""}`} onClick={() => openView(v.query, v.id)}>{v.name}</button>)}
          {dirty && loaded && (
            <span className="ml-1 flex items-center gap-1 rounded-md border border-warn/40 bg-warn/10 px-2 py-0.5 text-xs text-warn">
              Unsaved changes
              <button type="button" className="ml-1 font-medium underline" disabled={saving} onClick={() => void save(false)}>Save</button>
              <button type="button" className="font-medium underline" onClick={() => setSaveOpen(true)}>Save as new</button>
              <button type="button" className="font-medium underline" onClick={() => openView(loaded.query, loaded.id)}>Reset</button>
            </span>
          )}
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-3" aria-busy={pending}>
        <div className="flex flex-wrap items-center gap-2">
          <form role="search" className="min-w-48 flex-1" onSubmit={(e) => { e.preventDefault(); update(() => {}, true); }}>
            <input type="search" placeholder={searchPlaceholder} value={q} aria-label={searchPlaceholder} onChange={(e) => onSearch(e.target.value)} className="!min-h-10" />
          </form>
          {fields.length > 0 && <button type="button" className="btn btn-secondary min-h-10" onClick={() => { setPickerField(null); setPickerOpen(true); }}>Filter{count ? ` (${count})` : ""} <kbd className="ml-1 rounded border border-line px-1 text-[11px] text-faint">F</kbd></button>}
          {sorts.length > 0 && <select aria-label="Sort results" className="!min-h-10 !w-auto max-w-full" value={sort} onChange={(e) => update((p) => p.set("sort", e.target.value))}>
            {!sorts.some((s) => s.value === sort) && <option value={sort}>Column: {sort?.replace(/-desc$/, " ↓")}</option>}
            {sorts.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>}
          {(viewToggle || layouts) && <div className="flex overflow-hidden rounded-md border border-line-strong" role="group" aria-label="Layout">
            {modes.map((v) => <button type="button" key={v.value} className={`min-h-10 px-3 text-sm ${view === v.value ? "bg-ink text-paper" : "text-muted hover:bg-wash"}`} aria-pressed={view === v.value} onClick={() => { if (section && !layouts) setLayout(section, v.value as "table" | "cards"); update((p) => p.set("view", v.value)); }}>{v.label}</button>)}
          </div>}
          {view === "table" && <select aria-label="Row density" className="!min-h-10 !w-auto" value={density} onChange={(e) => setDensity(e.target.value as Density)}>
            <option value="compact">Compact</option><option value="regular">Regular</option><option value="relaxed">Relaxed</option>
          </select>}
        </div>
        {chips.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {chips.map((chip) => <button type="button" key={chip.key} className="chip !min-h-8 !whitespace-normal !border-accent/30 !bg-accent-wash" aria-label={`Remove filter ${chip.label}`} onClick={chip.remove}>{chip.label}<span aria-hidden className="ml-1">×</span></button>)}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => update((p) => { applyFilterState(p, { and: [], or: [] }, fields); p.delete("q"); })}>Clear all</button>
          {section && !loaded && <button type="button" className="btn btn-secondary btn-sm sm:ml-auto" onClick={() => setSaveOpen(true)}>Save as view</button>}
        </div>}
        {total === 0 && chips.length > 0 && <p className="mt-3 text-sm text-muted">No matches for this combination. Remove a filter or <Link className="text-accent underline" href={`/search?q=${encodeURIComponent(searchParams.get("q") ?? "")}`}>search across the Repo</Link>.</p>}
      </div>

      <FilterPicker open={pickerOpen} onClose={() => setPickerOpen(false)} fields={fields} state={state} onChange={setState} names={nameMap} initialField={pickerField} />
      <Modal open={saveOpen} onClose={() => { if (!saving) setSaveOpen(false); }} title="Save this view">
        <form onSubmit={(e) => { e.preventDefault(); if (viewName.trim()) void save(true); }}>
          <label>View name<input autoFocus required maxLength={100} className="mt-1" value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="e.g. Basketball talent with YouTube" /></label>
          <p className="mt-2 text-sm text-muted">Results stay up to date. The view appears above this list and in Collections.</p>
          <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={saving} className="btn btn-secondary" onClick={() => setSaveOpen(false)}>Cancel</button><button className="btn btn-accent" disabled={saving || !viewName.trim()}>{saving ? "Saving…" : "Save view"}</button></div>
        </form>
      </Modal>
    </div>
  );
}
