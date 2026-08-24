"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

type ResultItem = { label: string; sub?: string; href: string };
type ResultGroup = { group: string; items: ResultItem[] };

const ACTIONS: ResultItem[] = [
  { label: "Add Talent", href: "/talent/new" },
  { label: "Create Project", href: "/projects/new" },
  { label: "Add Format", href: "/formats/new" },
  { label: "Create Opportunity", href: "/opportunities/new" },
  { label: "Open AI Search", href: "/ai" },
  { label: "Open Ingest", href: "/ingest" },
];

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<ResultGroup[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  const openBar = useCallback(() => {
    setQ("");
    setGroups([]);
    setActive(0);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 10);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => {
          if (!v) setTimeout(() => openBar(), 0);
          return v ? false : v;
        });
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => openBar();
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-bar", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-bar", onOpen);
    };
  }, [openBar]);

  useEffect(() => {
    if (!open) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setGroups([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/command?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          setGroups(await res.json());
          setActive(0);
        }
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q, open]);

  const matchingActions = q.trim()
    ? ACTIONS.filter((a) => a.label.toLowerCase().includes(q.toLowerCase()))
    : ACTIONS;

  const allGroups: ResultGroup[] = [
    ...groups,
    ...(matchingActions.length
      ? [{ group: "Actions", items: matchingActions }]
      : []),
  ];
  const flat = allGroups.flatMap((g) => g.items);

  const go = useCallback(
    (item: ResultItem | undefined) => {
      if (!item) return;
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  if (!open) return null;

  let idx = -1;
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-start justify-center px-4 pt-[12vh]">
      <div
        className="absolute inset-0 bg-ink/40"
        aria-hidden
        onClick={() => setOpen(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        className="relative w-full max-w-xl overflow-hidden rounded-lg bg-surface shadow-pop"
      >
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={flat.length > 0}
          aria-controls="command-results"
          placeholder="Search talent, projects, companies, interests…"
          className="w-full border-0 border-b border-line !rounded-none px-4 !py-3 text-base outline-none"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, flat.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(flat[active]);
            }
          }}
        />
        <div id="command-results" className="max-h-[50vh] overflow-y-auto py-1">
          {loading && flat.length === 0 && (
            <div className="px-4 py-3 text-sm text-muted">Searching…</div>
          )}
          {!loading && q.trim() && flat.length === matchingActions.length && groups.length === 0 && (
            <div className="px-4 py-2 text-sm text-muted">
              No records match “{q}”.
            </div>
          )}
          {allGroups.map((g) => (
            <div key={g.group}>
              <div className="overline px-4 pb-1 pt-2.5">{g.group}</div>
              {g.items.map((item) => {
                idx++;
                const i = idx;
                return (
                  <button
                    key={`${g.group}-${item.href}-${item.label}`}
                    className={`flex w-full items-baseline justify-between gap-3 px-4 py-1.5 text-left text-sm ${
                      i === active ? "bg-wash" : "hover:bg-wash"
                    }`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(item)}
                  >
                    <span className="truncate font-medium">{item.label}</span>
                    {item.sub && (
                      <span className="shrink-0 text-xs text-muted">
                        {item.sub}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
