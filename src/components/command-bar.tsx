"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useDialogFocus } from "@/components/overlay";
import { PAGE_LINKS, CREATE_ITEMS, allowedNav } from "@/lib/navigation";

type ResultItem = { label: string; sub?: string; href: string };
type ResultGroup = { group: string; items: ResultItem[] };
export function CommandBar(permissions: { isEditor?: boolean; isAdmin?: boolean; isOwner?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [response, setResponse] = useState<{ q: string; groups: ResultGroup[]; error?: boolean } | null>(null);
  const [active, setActive] = useState(0);
  const router = useRouter();
  const panel = useDialogFocus(open, () => setOpen(false));
  const resultsRef = useRef<HTMLDivElement>(null);
  const openBar = useCallback(() => { setQ(""); setResponse(null); setActive(0); setOpen(true); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (open) setOpen(false); else openBar(); }
    };
    window.addEventListener("keydown", onKey); window.addEventListener("open-command-bar", openBar);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("open-command-bar", openBar); };
  }, [openBar, open]);
  const query = q.trim();
  useEffect(() => {
    if (!open || !query) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/command?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Search failed");
        const groups: ResultGroup[] = await res.json();
        if (!controller.signal.aborted) { setResponse({ q: query, groups }); setActive(0); }
      } catch { if (!controller.signal.aborted) setResponse({ q: query, groups: [], error: true }); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open]);
  const loading = !!query && response?.q !== query;
  const records = !loading && query ? response?.groups ?? [] : [];
  const matches = (item: ResultItem) => !query || `${item.label} ${item.sub ?? ""}`.toLowerCase().includes(query.toLowerCase());
  const navigation = allowedNav(PAGE_LINKS, permissions).map((p) => ({ ...p, sub: p.description })).filter(matches);
  const actions = allowedNav(CREATE_ITEMS, permissions).filter(matches);
  const allGroups: ResultGroup[] = [
    ...(query ? [{ group: "Search", items: [{ label: `See all results for “${query}”`, href: `/search?q=${encodeURIComponent(query)}` }] }] : []),
    ...records,
    ...(navigation.length ? [{ group: "Go to", items: navigation }] : []),
    ...(actions.length ? [{ group: "Create", items: actions }] : []),
  ];
  const flat = allGroups.flatMap((g) => g.items);
  const selected = Math.min(active, Math.max(0, flat.length - 1));
  useEffect(() => { resultsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [selected]);
  const go = (item?: ResultItem) => { if (item) { setOpen(false); router.push(item.href); } };
  if (!open) return null;
  let index = -1;
  return createPortal(<div className="fixed inset-0 z-[85] flex items-start justify-center px-3 pt-[8vh] sm:pt-[12vh]">
    <div className="absolute inset-0 bg-ink/40" aria-hidden onClick={() => setOpen(false)} />
    <div ref={panel} role="dialog" aria-modal="true" aria-label="Quick search and navigation" tabIndex={-1} className="relative w-full max-w-2xl overflow-hidden rounded-xl bg-surface shadow-pop">
      <div className="flex items-center border-b border-line px-2"><input autoFocus type="search" role="combobox" aria-label="Quick search" aria-autocomplete="list" aria-expanded={flat.length > 0} aria-controls="command-results" aria-activedescendant={flat.length ? `command-option-${selected}` : undefined} placeholder="Search the Repo or jump to a page…" className="!border-0 !px-3 !py-4 !text-base" maxLength={200} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={(e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
        else if (e.key === "Enter") { e.preventDefault(); go(flat[selected]); }
      }} /><button className="btn btn-ghost px-3" aria-label="Close search" onClick={() => setOpen(false)}>×</button></div>
      {loading && <p className="px-4 py-2 text-sm text-muted" role="status">Searching records…</p>}
      {!loading && response?.error && query && <p className="px-4 py-2 text-sm text-muted" role="alert">Search is temporarily unavailable. Try again or open a section below.</p>}
      {!loading && query && !response?.error && records.length === 0 && <p className="px-4 py-2 text-sm text-muted">No active records match. Open all results to include the archive.</p>}
      <div ref={resultsRef} id="command-results" role="listbox" aria-label="Search results and pages" className="max-h-[60dvh] overflow-y-auto py-2">{allGroups.map((group) => <div key={group.group} role="group" aria-label={group.group}><div className="overline px-4 pb-1 pt-2">{group.group}</div>{group.items.map((item) => { const i = ++index; return <div role="option" id={`command-option-${i}`} aria-selected={selected === i} key={`${group.group}-${item.href}`} className={`flex cursor-pointer items-baseline justify-between gap-3 px-4 py-2.5 text-sm ${selected === i ? "bg-accent-wash" : "hover:bg-wash"}`} onMouseEnter={() => setActive(i)} onClick={() => go(item)}><span className="truncate font-medium">{item.label}</span>{item.sub && <span className="max-w-[40%] truncate text-xs text-muted">{item.sub}</span>}</div>; })}</div>)}</div>
      <div className="border-t border-line px-4 py-2 text-xs text-muted">↑ ↓ to select · Enter to open · Esc to close</div>
    </div>
  </div>, document.body);
}
