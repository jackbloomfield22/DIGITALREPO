"use client";

// Generic directory header: search, configurable filters (selects and
// typeahead lookups), sort, optional view toggle, removable filter chips.
// State lives entirely in the URL so back-navigation restores it.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { saveView } from "@/lib/actions/misc";
import { useToast } from "@/components/toast";
import type { LabeledValue } from "@/lib/taxonomy";

export type FilterDef =
  | { param: string; label: string; kind: "select"; options: LabeledValue[] }
  | { param: string; label: string; kind: "lookup"; lookupType: string; lookupKind?: string };

export type DirChip = { param: string; value: string; label: string };

export function DirectoryControls({
  title,
  total,
  createHref,
  createLabel,
  searchPlaceholder,
  filters,
  sorts,
  chips,
  canEdit,
  viewToggle,
  savedViewType,
}: {
  title: string;
  total: number;
  createHref?: string;
  createLabel?: string;
  searchPlaceholder: string;
  filters: FilterDef[];
  sorts: LabeledValue[];
  chips: DirChip[];
  canEdit: boolean;
  viewToggle?: boolean;
  savedViewType?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [menu, setMenu] = useState<string | null>(null);
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [lookupQ, setLookupQ] = useState("");
  const [lookupItems, setLookupItems] = useState<{ id: string; name: string; sub?: string }[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = (mutate: (p: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const activeLookup = filters.find((f) => f.param === menu && f.kind === "lookup") as
    | Extract<FilterDef, { kind: "lookup" }>
    | undefined;

  useEffect(() => {
    if (!activeLookup) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      const params = new URLSearchParams({ type: activeLookup.lookupType, q: lookupQ });
      if (activeLookup.lookupKind) params.set("kind", activeLookup.lookupKind);
      try {
        const res = await fetch(`/api/lookup?${params}`, { signal: controller.signal });
        if (res.ok) setLookupItems(await res.json());
      } catch {}
    }, 150);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [lookupQ, activeLookup]);

  const view = searchParams.get("view") === "table" ? "table" : "cards";

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
          <span className="text-sm text-muted">{total}</span>
        </div>
        {canEdit && createHref && (
          <Link href={createHref} className="btn btn-accent">
            {createLabel ?? "+ Create"}
          </Link>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="w-full max-w-xs">
          <input
            type="search"
            placeholder={searchPlaceholder}
            value={q}
            aria-label={searchPlaceholder}
            onChange={(e) => {
              setQ(e.target.value);
              if (debounceRef.current) clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => {
                const value = e.target.value.trim();
                update((p) => (value ? p.set("q", value) : p.delete("q")));
              }, 250);
            }}
          />
        </div>

        <span className="relative">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setMenu(menu ? null : "root");
              setLookupQ("");
            }}
            aria-expanded={!!menu}
          >
            + Filter
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-20" aria-hidden onClick={() => setMenu(null)} />
              <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-md border border-line bg-surface p-2 shadow-pop">
                {menu === "root" && (
                  <div className="text-sm">
                    {filters.map((f) => (
                      <button
                        key={f.param}
                        className="block w-full rounded px-2 py-1.5 text-left hover:bg-wash"
                        onClick={() => setMenu(f.param)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}
                {filters.map((f) =>
                  f.param === menu && f.kind === "select" ? (
                    <div key={f.param} className="max-h-64 overflow-y-auto text-sm">
                      {f.options.map((o) => (
                        <button
                          key={o.value}
                          className="block w-full rounded px-2 py-1.5 text-left hover:bg-wash"
                          onClick={() => {
                            update((p) => p.set(f.param, o.value));
                            setMenu(null);
                          }}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  ) : null,
                )}
                {activeLookup && (
                  <div>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search…"
                      value={lookupQ}
                      onChange={(e) => setLookupQ(e.target.value)}
                      aria-label={activeLookup.label}
                    />
                    <div className="mt-1 max-h-52 overflow-y-auto">
                      {lookupItems.map((item) => (
                        <button
                          key={item.id}
                          className="flex w-full items-baseline justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-wash"
                          onClick={() => {
                            update((p) => p.set(activeLookup.param, item.id));
                            setMenu(null);
                          }}
                        >
                          <span className="truncate">{item.name}</span>
                          {item.sub && <span className="shrink-0 text-xs text-muted">{item.sub}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </span>

        {sorts.length > 0 && (
          <select
            aria-label="Sort"
            className="!w-auto text-sm"
            value={searchParams.get("sort") ?? sorts[0]?.value}
            onChange={(e) => update((p) => p.set("sort", e.target.value))}
          >
            {sorts.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        )}

        {viewToggle && (
          <div className="flex overflow-hidden rounded-md border border-line-strong" role="group" aria-label="View mode">
            {(["cards", "table"] as const).map((v) => (
              <button
                key={v}
                className={`px-3 py-1.5 text-sm ${view === v ? "bg-ink text-paper" : "bg-surface text-muted hover:bg-wash"}`}
                aria-pressed={view === v}
                onClick={() => update((p) => p.set("view", v))}
              >
                {v === "cards" ? "Cards" : "Table"}
              </button>
            ))}
          </div>
        )}

        {savedViewType && chips.length > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              const name = window.prompt("Save this view as…");
              if (!name) return;
              const params = new URLSearchParams(searchParams.toString());
              params.delete("page");
              const res = await saveView({ name, targetType: savedViewType, query: params.toString() });
              toast(res.ok ? `Saved view “${name}”` : (res.error ?? "Could not save"), res.ok ? {} : { tone: "error" });
            }}
          >
            Save View
          </button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <span key={`${chip.param}-${chip.value}`} className="chip bg-wash">
              {chip.label}
              <button
                aria-label={`Remove filter ${chip.label}`}
                className="ml-0.5 text-muted hover:text-accent"
                onClick={() => update((p) => p.delete(chip.param))}
              >
                ×
              </button>
            </span>
          ))}
          <button
            className="text-xs text-muted underline underline-offset-2 hover:text-accent"
            onClick={() => router.replace(pathname, { scroll: false })}
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
