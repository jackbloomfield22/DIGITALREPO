"use client";

// The side panel. Any row or chip can open a record here without leaving the
// list; the content pushes over rather than being covered. ↑ and ↓ move to
// the previous and next record in the list you came from, Escape closes, and
// the URL carries the open record so the view can be shared.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { useEffect, useState } from "react";
import { useListMemory } from "@/components/list-memory";
import { StatusPill } from "@/components/ui";
import { labelFor } from "@/lib/taxonomy";
import { relativeTime } from "@/lib/format";
import { RECORD_TYPE_PATH, typeLabel } from "@/lib/record-types";
import { recordTypeOf } from "@/lib/record-paths";

type Peek = {
  type: string; id: string; name: string; href: string; typeLabel: string; status: string | null; archived: boolean;
  fields: { name: string; label: string; value: string; kind: string }[]; lines: string[]; updatedAt: string;
};

/** Open a record in the side panel from anywhere. */
export function usePeek() {
  const [peek, setPeek] = useQueryState("peek", { history: "push" });
  return {
    peek,
    open: (type: string, id: string) => setPeek(`${type}:${id}`),
    openHref: (href: string) => { const t = recordTypeOf(href); if (t) setPeek(`href:${href}`); },
    close: () => setPeek(null),
  };
}

export function PeekPanel({ canEdit }: { canEdit: boolean }) {
  const { peek, close, open } = usePeek();
  const router = useRouter();
  const [data, setData] = useState<{ key: string; peek: Peek | null; error?: string } | null>(null);
  const [type, id] = peek?.startsWith("href:") ? ["", ""] : (peek ?? "").split(":");
  const memory = useListMemory((type || "creator") as Parameters<typeof useListMemory>[0]);

  // Mark the page so the content makes room.
  useEffect(() => {
    document.documentElement.classList.toggle("peek-open", !!peek);
    return () => document.documentElement.classList.remove("peek-open");
  }, [peek]);

  useEffect(() => {
    if (!peek) return;
    const controller = new AbortController();
    const key = peek;
    const url = peek.startsWith("href:") ? `/api/peek?href=${encodeURIComponent(peek.slice(5))}` : `/api/peek?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`;
    fetch(url, { signal: controller.signal })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error ?? "Could not load"); return r.json() as Promise<Peek>; })
      .then((p) => setData({ key, peek: p }))
      .catch((e) => { if (!controller.signal.aborted) setData({ key, peek: null, error: e instanceof Error ? e.message : "Could not load" }); });
    return () => controller.abort();
  }, [peek, type, id]);

  // Neighbours in the list you came from.
  const current = data?.peek;
  const items = memory?.items ?? [];
  const index = current ? items.findIndex((x) => x.href === current.href) : -1;
  const step = (dir: -1 | 1) => {
    const next = items[index + dir];
    if (!next) return;
    const t = recordTypeOf(next.href);
    if (!t) return;
    // The list remembers hrefs; the panel needs ids, so it opens by href and lets the server resolve.
    open("href", next.href);
  };
  useEffect(() => {
    if (!peek) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "Escape") { e.preventDefault(); close(); }
      if (e.key === "ArrowDown" && !e.metaKey) { e.preventDefault(); step(1); }
      if (e.key === "ArrowUp" && !e.metaKey) { e.preventDefault(); step(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peek, index, items.length]);

  if (!peek) return null;
  const loading = data?.key !== peek;
  return (
    <aside aria-label="Record details" className="no-print fixed inset-y-0 right-0 z-30 flex w-full flex-col border-l border-line bg-surface shadow-pop lg:w-[28rem]">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <button type="button" className="btn btn-ghost btn-sm" disabled={index <= 0} onClick={() => step(-1)} aria-label="Previous record" title="Previous (↑)">↑</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={index < 0 || index >= items.length - 1} onClick={() => step(1)} aria-label="Next record" title="Next (↓)">↓</button>
        {index >= 0 && <span className="text-xs text-faint">{index + 1} of {items.length}</span>}
        <span className="ml-auto" />
        {current && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { close(); router.push(current.href); }}>Open full page</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={close} aria-label="Close panel" title="Close (Esc)">×</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {loading && <div className="space-y-3" aria-busy="true"><div className="h-6 w-2/3 rounded bg-wash" /><div className="h-4 w-1/3 rounded bg-wash" /><div className="mt-6 h-4 w-full rounded bg-wash" /><div className="h-4 w-5/6 rounded bg-wash" /></div>}
        {!loading && data?.error && <p className="text-sm text-accent-deep">{data.error}</p>}
        {!loading && current && (
          <div>
            <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-faint"><span>{current.typeLabel}</span>{current.archived && <span className="rounded bg-wash px-1.5 py-0.5 text-muted normal-case tracking-normal">Archived</span>}</div>
            <h2 className="font-display text-2xl font-bold leading-tight"><Link href={current.href} className="hover:text-accent-deep">{current.name}</Link></h2>
            {current.status && <div className="mt-2"><StatusPill status={current.status} label={labelFor(current.status)} /></div>}
            {current.fields.length > 0 && (
              <dl className="mt-5 space-y-2 text-sm">
                {current.fields.filter((f) => f.name !== "status").map((f) => (
                  <div key={f.name} className="grid grid-cols-[7rem_1fr] gap-2"><dt className="text-xs uppercase tracking-wide text-faint">{f.label}</dt><dd className="min-w-0 whitespace-pre-wrap break-words text-charcoal">{f.value}</dd></div>
                ))}
              </dl>
            )}
            {current.lines.length > 0 && (
              <div className="mt-5">
                <div className="overline mb-1.5">Connections</div>
                <ul className="space-y-1 text-sm text-charcoal">{current.lines.map((l, i) => <li key={i} className="break-words">{l}</li>)}</ul>
              </div>
            )}
            <p className="mt-6 text-xs text-faint">Updated {relativeTime(current.updatedAt)} · {typeLabel(current.type)} in <Link href={RECORD_TYPE_PATH[current.type] ?? "/"} className="hover:text-accent">{typeLabel(current.type)}s</Link></p>
            {canEdit && <Link href={`${current.href}/edit`} className="btn btn-secondary btn-sm mt-3">Edit</Link>}
          </div>
        )}
      </div>
    </aside>
  );
}
