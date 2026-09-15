"use client";

// The list view every directory shares. Name first and sticky, text left,
// numbers right, hairline rows, a sticky header. Each header opens a menu:
// sort, filter by this column, hide, pin, and a drag handle to resize; the
// layout is remembered per person. Rows select on hover for bulk actions,
// open in the side panel on click, and take J/K, Enter, X and Space from the
// keyboard. Density comes from the person's preferences.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SortState } from "@/lib/directory-sort";
import { usePrefs } from "@/components/prefs-provider";
import { usePeek } from "@/components/peek-panel";
import { BulkBar } from "@/components/bulk-bar";
import { EmptyState } from "@/components/ui";
import type { LabeledValue } from "@/lib/filters";

export type TableColumn = {
  /** Stable key for preferences; defaults to the label. */
  key?: string;
  label: string;
  /** Omit to make the column unsortable. */
  sortKey?: string;
  /** Filter field this column corresponds to, for "Filter by this column". */
  filterKey?: string;
  align?: "left" | "right";
  /** Tailwind responsive class controlling when the column appears. */
  showAt?: string;
  width?: string;
};

export type TableRow = {
  id: string;
  href: string;
  cells: ReactNode[];
  /** Open in the side panel on click; the name link still goes to the page. */
  peek?: { type: string; id: string };
  archived?: boolean;
};

const DENSITY: Record<string, string> = { compact: "[&_td]:py-1 [&_td]:min-h-10 text-sm", regular: "[&_td]:py-2.5 [&_td]:min-h-12", relaxed: "[&_td]:py-4 [&_td]:min-h-14" };

export function RecordTable({ columns, rows, sort, empty = "Nothing here yet.", emptyAction, view, recordType, selectable, matchingIds = [], statuses, taggable }: {
  columns: TableColumn[];
  rows: TableRow[];
  sort: SortState;
  empty?: ReactNode;
  /** A button or link that adds the first record or clears the filters. */
  emptyAction?: ReactNode;
  /** Preferences key (usually the section). Without it, column set-up is not remembered. */
  view?: string;
  /** Record type for bulk actions and the side panel. */
  recordType?: string;
  selectable?: boolean;
  matchingIds?: string[];
  statuses?: LabeledValue[];
  taggable?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { density, columnsFor, setColumns } = usePrefs();
  const { open: openPeek, peek } = usePeek();
  const prefs = view ? columnsFor(view) : {};
  const [menu, setMenu] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<number>(-1);
  const tableRef = useRef<HTMLTableElement>(null);
  const keyOf = (c: TableColumn) => c.key ?? c.label;

  // Column layout: the first column is always first and visible.
  const ordered = useMemo(() => {
    const byKey = new Map(columns.map((c) => [keyOf(c), c]));
    const first = columns[0];
    const rest = columns.slice(1);
    const order = prefs.order?.filter((k) => byKey.has(k)) ?? [];
    const pinned = new Set(prefs.pinned ?? []);
    const hidden = new Set(prefs.hidden ?? []);
    const arranged = [...order.map((k) => byKey.get(k)!), ...rest.filter((c) => !order.includes(keyOf(c)))].filter((c) => c !== first);
    const visible = arranged.filter((c) => !hidden.has(keyOf(c)));
    return { list: [first, ...visible.filter((c) => pinned.has(keyOf(c))), ...visible.filter((c) => !pinned.has(keyOf(c)))], hidden: arranged.filter((c) => hidden.has(keyOf(c))), pinned };
  }, [columns, prefs.order, prefs.pinned, prefs.hidden]);
  const cellIndex = new Map(columns.map((c, i) => [keyOf(c), i]));

  const sortHref = (column: string, desc: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", desc ? `${column}-desc` : column); params.delete("page");
    return `${pathname}?${params.toString()}`;
  };
  const save = (patch: { order?: string[]; hidden?: string[]; widths?: Record<string, number>; pinned?: string[] }) => { if (view) setColumns(view, patch); };
  const hide = (k: string) => save({ hidden: [...new Set([...(prefs.hidden ?? []), k])] });
  const show = (k: string) => save({ hidden: (prefs.hidden ?? []).filter((x) => x !== k) });
  const pin = (k: string) => save({ pinned: ordered.pinned.has(k) ? [...ordered.pinned].filter((x) => x !== k) : [...ordered.pinned, k] });
  const move = (k: string, dir: -1 | 1) => {
    const keys = ordered.list.slice(1).map(keyOf);
    const i = keys.indexOf(k); const j = i + dir;
    if (i < 0 || j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    save({ order: keys });
  };
  const startResize = (k: string, e: React.MouseEvent<HTMLSpanElement>) => {
    e.preventDefault();
    const th = (e.currentTarget as HTMLElement).closest("th") as HTMLElement | null;
    const startX = e.clientX; const startW = th?.getBoundingClientRect().width ?? 120;
    const onMove = (ev: MouseEvent) => { const w = Math.max(60, Math.round(startW + ev.clientX - startX)); if (th) th.style.width = `${w}px`; };
    const onUp = (ev: MouseEvent) => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); const w = Math.max(60, Math.round(startW + ev.clientX - startX)); save({ widths: { ...(prefs.widths ?? {}), [k]: w } }); };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  };

  const focusRow = (i: number) => { setFocused(i); tableRef.current?.querySelectorAll<HTMLTableRowElement>("tbody tr")[i]?.focus(); };
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const openRow = (row: TableRow) => { if (row.peek) void openPeek(row.peek.type, row.peek.id); else if (recordType) void openPeek("href", row.href); else router.push(row.href); };

  // Escape closes an open column menu.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setMenu(null); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [menu]);

  // Keyboard on rows.
  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.tagName === "BUTTON" || t.tagName === "A") return;
      const i = focused;
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); focusRow(Math.min(rows.length - 1, i + 1)); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); focusRow(Math.max(0, i - 1)); }
      else if (e.key === "Enter" && rows[i]) { e.preventDefault(); router.push(rows[i].href); }
      else if ((e.key === "x" || e.key === "X") && rows[i] && selectable) { e.preventDefault(); toggle(rows[i].id); }
      else if (e.key === " " && rows[i]) { e.preventDefault(); openRow(rows[i]); }
      // Escape clears the selection only once nothing else is open above the list.
      else if (e.key === "Escape" && selected.size && !document.querySelector('[role="dialog"], aside[aria-label="Record details"]')) { setSelected(new Set()); }
    };
    table.addEventListener("keydown", onKey);
    return () => table.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, rows, selected.size, selectable]);
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const peekedHref = peek?.startsWith("href:") ? peek.slice(5) : null;
  const peekedId = peek && !peek.startsWith("href:") ? peek.split(":")[1] : null;

  if (!rows.length) {
    return <EmptyState title={typeof empty === "string" ? empty : undefined} message={typeof empty === "string" ? undefined : empty} action={emptyAction} />;
  }

  return (
    <div className="relative">
      {view && ordered.hidden.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted">
          <span>Hidden:</span>
          {ordered.hidden.map((c) => <button type="button" key={keyOf(c)} className="chip !min-h-7" onClick={() => show(keyOf(c))}>+ {c.label}</button>)}
          <button type="button" className="ml-1 underline hover:text-accent" onClick={() => save({ hidden: [], order: [], pinned: [], widths: {} })}>Reset columns</button>
        </div>
      )}
      <ul className="divide-y divide-line rounded-md border border-line bg-surface md:hidden" aria-label="Results">
        {rows.map((row) => (
          <li key={row.id} className={`px-3 py-2.5 ${selected.has(row.id) ? "bg-accent-wash/50" : ""}`} onClick={(e) => { const t = e.target as HTMLElement; if (t.closest("a, button, input, select, label")) return; openRow(row); }}>
            <div className="flex items-start gap-2">
              {selectable && <input type="checkbox" className="mt-1 !w-auto" aria-label="Select row" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />}
              <div className="min-w-0 flex-1">
                <Link href={row.href} className="font-medium hover:text-accent">{row.cells[cellIndex.get(keyOf(ordered.list[0])) ?? 0]}</Link>
                {row.archived && <span className="ml-1.5 rounded bg-wash px-1 py-0.5 text-xs font-semibold uppercase tracking-wide text-faint">Archived</span>}
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  {ordered.list.slice(1, 4).map((c, i) => {
                    const cell = row.cells[cellIndex.get(keyOf(c)) ?? i + 1];
                    if (cell == null || cell === "" || c.label === "") return null;
                    return <div key={keyOf(c)} className="contents"><dt className="text-faint">{c.label}</dt><dd className="min-w-0 truncate">{cell}</dd></div>;
                  })}
                </dl>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-md border border-line bg-surface md:block">
        <table ref={tableRef} className={`w-full min-w-0 border-collapse text-sm ${DENSITY[density] ?? DENSITY.regular}`}>
          <thead className="sticky top-0 z-10 bg-wash">
            <tr className="border-b border-line text-left">
              {selectable && <th scope="col" className="w-8 px-2"><input type="checkbox" className="!w-auto" aria-label="Select all on this page" checked={allOnPage} onChange={() => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)))} /></th>}
              {ordered.list.map((c, i) => {
                const k = keyOf(c);
                const active = c.sortKey && sort.key === c.sortKey;
                const width = prefs.widths?.[k];
                return (
                  <th key={k} scope="col" style={width ? { width } : c.width ? { width: c.width } : undefined}
                    className={`group/th relative px-3 py-2 text-xs font-semibold uppercase tracking-wide ${c.align === "right" ? "text-right" : "text-left"} ${i === 0 ? "sticky left-0 z-10 bg-wash" : c.showAt ?? ""}`}
                    aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}>
                    <button type="button" className={`inline-flex max-w-full items-center gap-1 hover:text-accent ${active ? "text-accent" : "text-muted"}`} aria-haspopup="menu" aria-expanded={menu === k} onClick={() => setMenu(menu === k ? null : k)}>
                      <span className="truncate">{c.label}</span>
                      {c.sortKey && <span aria-hidden className={active ? "" : "opacity-0 group-hover/th:opacity-100"}>{active ? (sort.desc ? "↓" : "↑") : "↕"}</span>}
                    </button>
                    {menu === k && (<>
                      <div className="fixed inset-0 z-20" aria-hidden onClick={() => setMenu(null)} />
                      <div role="menu" className="absolute left-0 top-full z-30 mt-1 w-52 rounded-md border border-line bg-surface p-1 text-left text-sm normal-case tracking-normal shadow-pop">
                        {c.sortKey && <><Link role="menuitem" href={sortHref(c.sortKey, false)} scroll={false} className="block rounded px-2 py-1.5 hover:bg-wash" onClick={() => setMenu(null)}>Sort ascending</Link><Link role="menuitem" href={sortHref(c.sortKey, true)} scroll={false} className="block rounded px-2 py-1.5 hover:bg-wash" onClick={() => setMenu(null)}>Sort descending</Link></>}
                        {c.filterKey && <button role="menuitem" type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-wash" onClick={() => { setMenu(null); window.dispatchEvent(new CustomEvent("open-filters", { detail: { field: c.filterKey } })); }}>Filter by {c.label.toLowerCase()}</button>}
                        {view && i > 0 && <>
                          <button role="menuitem" type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-wash" onClick={() => { setMenu(null); pin(k); }}>{ordered.pinned.has(k) ? "Unpin" : "Pin left"}</button>
                          <button role="menuitem" type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-wash" onClick={() => { setMenu(null); move(k, -1); }}>Move left</button>
                          <button role="menuitem" type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-wash" onClick={() => { setMenu(null); move(k, 1); }}>Move right</button>
                          <button role="menuitem" type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-wash" onClick={() => { setMenu(null); hide(k); }}>Hide column</button>
                        </>}
                      </div>
                    </>)}
                    {view && <span role="separator" aria-orientation="vertical" className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 hover:bg-accent/40 group-hover/th:opacity-100" onMouseDown={(e) => startResize(k, e)} />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const isSelected = selected.has(row.id);
              const isPeeked = (peekedId && row.peek?.id === peekedId) || (peekedHref && row.href === peekedHref);
              return (
                <tr key={row.id} tabIndex={0} aria-selected={isSelected || undefined} data-peeked={isPeeked || undefined}
                  className={`group/row border-b border-line last:border-0 outline-none focus-visible:bg-accent-wash/60 ${isSelected ? "bg-accent-wash/50" : isPeeked ? "bg-wash" : "hover:bg-wash/60"}`}
                  onFocus={() => setFocused(ri)}
                  onClick={(e) => { const t = e.target as HTMLElement; if (t.closest("a, button, input, select, label")) return; openRow(row); }}>
                  {selectable && <td className="w-8 px-2 align-middle"><input type="checkbox" className={`!w-auto ${isSelected ? "" : "opacity-30 group-hover/row:opacity-100 focus-visible:opacity-100"}`} aria-label="Select row" checked={isSelected} onChange={() => toggle(row.id)} /></td>}
                  {ordered.list.map((c, i) => {
                    const cell = row.cells[cellIndex.get(keyOf(c)) ?? i];
                    return (
                      <td key={keyOf(c)} className={`px-3 align-top ${c.align === "right" ? "text-right tabular-nums" : ""} ${i === 0 ? `sticky left-0 z-[1] ${isSelected ? "bg-accent-wash/50" : isPeeked ? "bg-wash" : "bg-surface group-hover/row:bg-wash/60"}` : c.showAt ?? ""}`}>
                        {i === 0 ? <><Link href={row.href} className="font-medium hover:text-accent">{cell}</Link>{row.archived && <span className="ml-1.5 rounded bg-wash px-1 py-0.5 text-xs font-semibold uppercase tracking-wide text-faint">Archived</span>}</> : cell}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selectable && recordType && <BulkBar type={recordType} selected={[...selected]} matching={matchingIds} onClear={() => setSelected(new Set())} onSelectAll={() => setSelected(new Set(matchingIds))} statuses={statuses} taggable={taggable} />}
    </div>
  );
}
