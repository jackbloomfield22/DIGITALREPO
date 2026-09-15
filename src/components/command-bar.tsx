"use client";

// ⌘K. Empty: the last records you opened. Typed: actions for the page you
// are on, places to go, then live results across every record type — the
// same tiered order as the search page. Enter opens; ⌘↩ opens in the side
// panel; Escape closes; Backspace on an empty box steps back out of a
// sub-list. Shortcuts sit on the right of action rows so the palette
// teaches them.

import { Command } from "cmdk";
import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { matchSorter } from "match-sorter";
import { useDialogFocus } from "@/components/overlay";
import { useCurrentRecord } from "@/components/record-context";
import { usePeek } from "@/components/peek-panel";
import { useToast } from "@/components/toast";
import { PAGE_LINKS, CREATE_ITEMS, CREATE_FOR_SECTION, allowedNav } from "@/lib/navigation";
import { typeLabel } from "@/lib/record-types";
import { archiveRecord, setRecordStatus } from "@/lib/actions/quick-edit";
import { toggleFavorite } from "@/lib/actions/misc";
import { statusOptionsFor, STATUS_TYPES, type StatusType, type ArchiveType } from "@/lib/row-status";

type Result = { id: string; type: string; label: string; href: string; sub?: string; archived?: boolean };
type ResultGroup = { group: string; type: string; items: Result[] };
type Recent = { type: string; id: string; name: string; href: string; sub?: string };
type Action = { id: string; label: string; hint?: string; shortcut?: string; run: () => void | Promise<void>; keep?: boolean };

export function CommandPalette({ isEditor, isAdmin, isOwner, recents: initialRecents }: { isEditor?: boolean; isAdmin?: boolean; isOwner?: boolean; recents: Recent[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState<"root" | "status">("root");
  const [selected, setSelected] = useState("");
  const [recents, setRecents] = useState<Recent[]>(initialRecents);
  const [response, setResponse] = useState<{ q: string; groups: ResultGroup[]; error?: boolean } | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const record = useCurrentRecord();
  const { open: openPeek } = usePeek();
  const { toast } = useToast();
  const panel = useDialogFocus(open, () => setOpen(false));
  const permissions = { isEditor, isAdmin, isOwner };

  const openBar = useCallback(() => {
    setQ(""); setPage("root"); setResponse(null); setOpen(true);
    fetch("/api/recent").then((r) => (r.ok ? r.json() : [])).then((rows: Recent[]) => { if (Array.isArray(rows)) setRecents(rows); }).catch(() => {});
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (open) setOpen(false); else openBar(); }
    };
    window.addEventListener("keydown", onKey); window.addEventListener("open-command-bar", openBar);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("open-command-bar", openBar); };
  }, [openBar, open]);

  const query = q.trim();
  useEffect(() => {
    if (!open || !query || page !== "root") return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/command?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Search failed");
        const groups: ResultGroup[] = await res.json();
        if (!controller.signal.aborted) setResponse({ q: query, groups });
      } catch { if (!controller.signal.aborted) setResponse({ q: query, groups: [], error: true }); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open, page]);
  const loading = !!query && page === "root" && response?.q !== query;
  const results = !loading && query ? response?.groups ?? [] : [];

  const go = useCallback((href: string) => { setOpen(false); router.push(href); }, [router]);
  const section = "/" + (pathname.split("/")[1] ?? "");
  const createHref = CREATE_FOR_SECTION[section];

  // Actions for the page you are on.
  const actions = useMemo<Action[]>(() => {
    const list: Action[] = [];
    if (record) {
      list.push({ id: "peek", label: `Open “${record.name}” in the side panel`, shortcut: "⌘↩", run: () => { void openPeek(record.type, record.id); } });
      list.push({ id: "copy", label: "Copy link to this record", run: async () => { await navigator.clipboard.writeText(window.location.origin + record.path); toast("Link copied."); } });
      list.push({ id: "fav", label: "Star / unstar this record", run: async () => { const r = await toggleFavorite(record.type, record.id); toast(r && "ok" in r && !r.ok ? "Could not update favorites." : "Favorites updated."); router.refresh(); } });
      if (record.canEdit) {
        list.push({ id: "edit", label: "Edit this record", shortcut: "E", run: () => go(`${record.path}/edit`) });
        if ((STATUS_TYPES as readonly string[]).includes(record.type)) list.push({ id: "status", label: "Change status…", shortcut: "S", keep: true, run: () => { setPage("status"); setQ(""); } });
        list.push({ id: "archive", label: "Archive this record", hint: "Restorable from the Archive", run: async () => { const r = await archiveRecord(record.type as ArchiveType, record.id); if (!r.ok) return toast(r.error ?? "Could not archive.", { tone: "error" }); toast(`${record.name} moved to the Archive.`); router.refresh(); } });
      }
    } else if (createHref && isEditor) {
      list.push({ id: "create", label: `Create in ${typeOfSection(section)}`, shortcut: "C", run: () => go(createHref) });
    }
    if (!record && pathname !== "/") list.push({ id: "filter", label: "Filter this list", shortcut: "F", run: () => { window.dispatchEvent(new CustomEvent("open-filters")); } });
    list.push({ id: "shortcuts", label: "Keyboard shortcuts", shortcut: "?", run: () => { window.dispatchEvent(new CustomEvent("open-shortcuts")); } });
    return list;
  }, [record, createHref, isEditor, section, pathname, openPeek, go, router, toast]);

  const navigation = allowedNav(PAGE_LINKS, permissions).map((p) => ({ label: p.label, href: p.href, sub: p.description, shortcut: p.shortcut }));
  const creates = allowedNav(CREATE_ITEMS, permissions);
  const filteredActions = query ? matchSorter(actions, query, { keys: ["label"] }) : actions;
  const filteredNav = query ? matchSorter(navigation, query, { keys: ["label", "sub"] }).slice(0, 6) : navigation.slice(0, 8);
  const filteredCreates = query ? matchSorter(creates, query, { keys: ["label"] }).slice(0, 4) : [];
  const statusOptions = record && page === "status" ? statusOptionsFor(record.type as StatusType) : [];
  const filteredStatuses = query ? matchSorter(statusOptions, query, { keys: ["label"] }) : statusOptions;

  // Where each row leads, so ⌘↩ can open the highlighted record in the panel. Rebuilt every render.
  const hrefByValue = new Map<string, string>();
  const runSelected = (withMeta: boolean) => {
    const href = hrefByValue.get(selected);
    if (withMeta && href) { setOpen(false); void openPeek("href", href); }
  };

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-start justify-center px-3 pt-[8vh] sm:pt-[12vh]">
      <div className="absolute inset-0 bg-ink/40" aria-hidden onClick={() => setOpen(false)} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label="Search and commands" tabIndex={-1} className="relative w-full max-w-2xl overflow-hidden rounded-xl bg-surface shadow-pop">
        <Command label="Search and commands" shouldFilter={false} loop value={selected} onValueChange={setSelected}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !q && page !== "root") { e.preventDefault(); setPage("root"); }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runSelected(true); }
          }}>
          <div className="flex items-center border-b border-line px-2">
            {page !== "root" && <span className="ml-2 rounded bg-wash px-2 py-0.5 text-xs text-muted">Status</span>}
            <Command.Input autoFocus value={q} onValueChange={setQ} placeholder={page === "status" ? "Pick a status…" : "Search the Repo, or type a command…"} className="!border-0 !px-3 !py-4 !text-base focus:!outline-none" maxLength={200} />
            <button className="btn btn-ghost px-3" aria-label="Close" onClick={() => setOpen(false)}>×</button>
          </div>
          <Command.List className="max-h-[60dvh] overflow-y-auto py-2">
            {page === "status" && record && (
              <Command.Group heading="Set status" className="cmdk-group">
                {filteredStatuses.map((s) => (
                  <Command.Item key={s.value} value={`status:${s.value}`} className="cmdk-item" onSelect={async () => { const r = await setRecordStatus(record.type as StatusType, record.id, s.value); setOpen(false); if (!r.ok) return toast(r.error ?? "Could not change status.", { tone: "error" }); toast(`Status set to ${s.label}.`); router.refresh(); }}>
                    <span>{s.label}</span>{record.status === s.value && <span className="ml-auto text-xs text-faint">current</span>}
                  </Command.Item>
                ))}
                <Command.Empty className="px-4 py-3 text-sm text-muted">No status matches.</Command.Empty>
              </Command.Group>
            )}
            {page === "root" && (<>
              {!query && recents.length > 0 && (
                <Command.Group heading="Recent" className="cmdk-group">
                  {recents.slice(0, 8).map((r) => { const v = `recent:${r.type}:${r.id}`; hrefByValue.set(v, r.href); return (
                    <Command.Item key={v} value={v} className="cmdk-item" onSelect={() => go(r.href)}>
                      <span className="w-16 shrink-0 text-[11px] uppercase tracking-wide text-faint">{typeLabel(r.type)}</span><span className="truncate font-medium">{r.name}</span>{r.sub && <span className="ml-auto max-w-[40%] truncate text-xs text-muted">{r.sub}</span>}
                    </Command.Item>); })}
                </Command.Group>
              )}
              {filteredActions.length > 0 && (
                <Command.Group heading="Actions" className="cmdk-group">
                  {filteredActions.map((a) => (
                    <Command.Item key={a.id} value={`action:${a.id}`} className="cmdk-item" onSelect={async () => { if (!a.keep) setOpen(false); await a.run(); }}>
                      <span className="truncate">{a.label}</span>{a.hint && <span className="truncate text-xs text-muted">{a.hint}</span>}{a.shortcut && <kbd className="ml-auto rounded border border-line px-1.5 text-[11px] text-faint">{a.shortcut}</kbd>}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {(filteredNav.length > 0 || filteredCreates.length > 0) && (
                <Command.Group heading="Navigation" className="cmdk-group">
                  {filteredNav.map((n) => (
                    <Command.Item key={n.href} value={`nav:${n.href}`} className="cmdk-item" onSelect={() => go(n.href)}>
                      <span className="truncate">Go to {n.label}</span>{n.sub && <span className="truncate text-xs text-muted">{n.sub}</span>}{n.shortcut && <kbd className="ml-auto rounded border border-line px-1.5 text-[11px] text-faint">{n.shortcut}</kbd>}
                    </Command.Item>
                  ))}
                  {filteredCreates.map((c) => (
                    <Command.Item key={c.href} value={`create:${c.href}`} className="cmdk-item" onSelect={() => go(c.href)}><span>{c.label}</span></Command.Item>
                  ))}
                </Command.Group>
              )}
              {loading && <div className="px-4 py-2.5 text-sm text-muted" role="status">Searching records…</div>}
              {!loading && response?.error && query && <div className="px-4 py-2.5 text-sm text-muted" role="alert">Search is unavailable right now. The pages above still work.</div>}
              {results.map((g) => (
                <Command.Group key={g.type} heading={g.group} className="cmdk-group">
                  {g.items.map((r) => { const v = `rec:${r.type}:${r.id}`; hrefByValue.set(v, r.href); return (
                    <Command.Item key={v} value={v} className="cmdk-item" onSelect={() => go(r.href)}>
                      <span className="w-16 shrink-0 text-[11px] uppercase tracking-wide text-faint">{typeLabel(r.type)}</span><span className="truncate font-medium">{r.label}</span><span className="ml-auto max-w-[45%] truncate text-xs text-muted">{r.archived ? "Archived" : r.sub}</span>
                    </Command.Item>); })}
                </Command.Group>
              ))}
              {query && !loading && !results.length && !response?.error && (
                <Command.Item value="see-all" className="cmdk-item" onSelect={() => go(`/search?q=${encodeURIComponent(query)}`)}><span>No records match “{query}” — search everything, including the Archive</span></Command.Item>
              )}
              {query && results.length > 0 && (
                <Command.Item value="see-all" className="cmdk-item text-accent-deep" onSelect={() => go(`/search?q=${encodeURIComponent(query)}`)}><span>See all results for “{query}”</span><kbd className="ml-auto rounded border border-line px-1.5 text-[11px] text-faint">/search</kbd></Command.Item>
              )}
            </>)}
          </Command.List>
          <div className="flex flex-wrap gap-x-4 border-t border-line px-4 py-2 text-xs text-muted"><span>↑↓ move</span><span>↩ open</span><span>⌘↩ side panel</span><span>⌫ back</span><span>esc close</span></div>
        </Command>
      </div>
    </div>, document.body);
}

function typeOfSection(section: string): string {
  return { "/talent": "Talent", "/projects": "Projects", "/organizations": "Companies", "/formats": "Formats", "/opportunities": "Opportunities", "/people": "Industry people", "/youtube": "YouTube", "/collections": "Collections" }[section] ?? "this section";
}
