"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PROJECT_ROLES, SOCIAL_PLATFORMS, CREATOR_STATUSES, labelFor } from "@/lib/taxonomy";
import { saveView } from "@/lib/actions/misc";
import { useToast } from "@/components/toast";

type LookupItem = { id: string; name: string; sub?: string };

const SORTS = [
  { value: "name", label: "Alphabetical" },
  { value: "added", label: "Recently Added" },
  { value: "updated", label: "Recently Updated" },
  { value: "audience", label: "Largest Listed Audience" },
  { value: "instagram", label: "Instagram Following" },
  { value: "tiktok", label: "TikTok Following" },
  { value: "youtube", label: "YouTube Following" },
  { value: "formats", label: "Most Formats" },
  { value: "projects", label: "Most Projects" },
  { value: "connections", label: "Most Connections" },
];

function LookupList({
  type,
  kind,
  onPick,
}: {
  type: string;
  kind?: string;
  onPick: (item: LookupItem) => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<LookupItem[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(async () => {
      const params = new URLSearchParams({ type, q });
      if (kind) params.set("kind", kind);
      try {
        const res = await fetch(`/api/lookup?${params}`, { signal: controller.signal });
        if (res.ok) setItems(await res.json());
      } catch {}
    }, 150);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q, type, kind]);
  return (
    <div>
      <input
        type="text"
        autoFocus
        placeholder="Search…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Filter search"
      />
      <div className="mt-1 max-h-52 overflow-y-auto">
        {items.map((item) => (
          <button
            key={item.id}
            className="flex w-full items-baseline justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-wash"
            onClick={() => onPick(item)}
          >
            <span className="truncate">{item.name}</span>
            {item.sub && <span className="shrink-0 text-xs text-muted">{item.sub}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export type ActiveChip = { param: string; value: string; label: string };

export function CreatorDirectoryControls({
  total,
  activeChips,
  canEdit,
}: {
  total: number;
  activeChips: ActiveChip[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [filterMenu, setFilterMenu] = useState<string | null>(null);
  const [minInput, setMinInput] = useState(searchParams.get("min") ?? "");
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = (mutate: (p: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const onSearch = (value: string) => {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      update((p) => {
        if (value.trim()) p.set("q", value.trim());
        else p.delete("q");
      });
    }, 250);
  };

  const removeChip = (chip: ActiveChip) => {
    update((p) => {
      if (chip.param === "entity") {
        const rest = p.getAll("entity").filter((v) => v !== chip.value);
        p.delete("entity");
        rest.forEach((v) => p.append("entity", v));
      } else {
        p.delete(chip.param);
        if (chip.param === "platform") p.delete("min");
        if (chip.param === "min" && !p.get("platform")) p.delete("min");
      }
    });
  };

  const view = searchParams.get("view") === "table" ? "table" : "cards";
  const sort = searchParams.get("sort") ?? "name";

  const closeMenu = () => setFilterMenu(null);

  const filterPanel = (
    <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-md border border-line bg-surface p-2 shadow-pop">
      {filterMenu === "root" && (
        <div className="text-sm">
          {[
            ["entity", "Interest / Sport / Location / Category"],
            ["role", "Project Role"],
            ["org", "Organization / Brand"],
            ["rep", "Representative"],
            ["format", "Format"],
            ["platform", "Social Platform & Reach"],
            ["status", "Talent Status"],
          ].map(([key, filterLabel]) => (
            <button
              key={key}
              className="block w-full rounded px-2 py-1.5 text-left hover:bg-wash"
              onClick={() => setFilterMenu(key)}
            >
              {filterLabel}
            </button>
          ))}
        </div>
      )}
      {filterMenu === "entity" && (
        <LookupList
          type="entity"
          onPick={(item) => {
            update((p) => {
              if (!p.getAll("entity").includes(item.id)) p.append("entity", item.id);
            });
            closeMenu();
          }}
        />
      )}
      {filterMenu === "org" && (
        <LookupList
          type="organization"
          onPick={(item) => {
            update((p) => p.set("org", item.id));
            closeMenu();
          }}
        />
      )}
      {filterMenu === "rep" && (
        <LookupList
          type="person"
          onPick={(item) => {
            update((p) => p.set("rep", item.id));
            closeMenu();
          }}
        />
      )}
      {filterMenu === "role" && (
        <div className="max-h-60 overflow-y-auto text-sm">
          {PROJECT_ROLES.map((r) => (
            <button
              key={r.value}
              className="block w-full rounded px-2 py-1.5 text-left hover:bg-wash"
              onClick={() => {
                update((p) => p.set("role", r.value));
                closeMenu();
              }}
            >
              Has been {r.label}
            </button>
          ))}
        </div>
      )}
      {filterMenu === "format" && (
        <div className="text-sm">
          <button
            className="block w-full rounded px-2 py-1.5 text-left hover:bg-wash"
            onClick={() => {
              update((p) => p.set("format", "any"));
              closeMenu();
            }}
          >
            Has any format
          </button>
          <button
            className="block w-full rounded px-2 py-1.5 text-left hover:bg-wash"
            onClick={() => {
              update((p) => p.set("format", "none"));
              closeMenu();
            }}
          >
            No format attached
          </button>
          <div className="mt-1 border-t border-line pt-1">
            <LookupList
              type="format"
              onPick={(item) => {
                update((p) => p.set("format", item.id));
                closeMenu();
              }}
            />
          </div>
        </div>
      )}
      {filterMenu === "platform" && (
        <div className="space-y-2 text-sm">
          <select
            aria-label="Platform"
            defaultValue={searchParams.get("platform") ?? ""}
            onChange={(e) => update((p) => (e.target.value ? p.set("platform", e.target.value) : p.delete("platform")))}
          >
            <option value="">Any platform (total audience)</option>
            {SOCIAL_PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              placeholder="Min followers"
              value={minInput}
              onChange={(e) => setMinInput(e.target.value)}
              aria-label="Minimum followers"
            />
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                update((p) => (minInput ? p.set("min", minInput) : p.delete("min")));
                closeMenu();
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
      {filterMenu === "status" && (
        <div className="text-sm">
          {CREATOR_STATUSES.map((s) => (
            <button
              key={s.value}
              className="block w-full rounded px-2 py-1.5 text-left hover:bg-wash"
              onClick={() => {
                update((p) => p.set("status", s.value));
                closeMenu();
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">TALENT</h1>
          <span className="text-sm text-muted">{total}</span>
        </div>
        {canEdit && (
          <Link href="/talent/new" className="btn btn-accent">
            + Add Talent
          </Link>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="w-full max-w-xs">
          <input
            type="search"
            placeholder="Search talent…"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Search talent"
          />
        </div>

        <span className="relative">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setFilterMenu(filterMenu ? null : "root")}
            aria-expanded={!!filterMenu}
          >
            + Filter
          </button>
          {filterMenu && (
            <>
              <div className="fixed inset-0 z-20" aria-hidden onClick={closeMenu} />
              {filterPanel}
            </>
          )}
        </span>

        <select
          aria-label="Sort"
          className="!w-auto text-sm"
          value={sort}
          onChange={(e) => update((p) => p.set("sort", e.target.value))}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

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

        {activeChips.length > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              const name = window.prompt("Save this view as… (results update automatically as the database changes)");
              if (!name) return;
              const params = new URLSearchParams(searchParams.toString());
              params.delete("page");
              const res = await saveView({ name, targetType: "creators", query: params.toString() });
              toast(res.ok ? `Saved view “${name}”` : (res.error ?? "Could not save view"), res.ok ? {} : { tone: "error" });
            }}
          >
            Save View
          </button>
        )}
      </div>

      {activeChips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {activeChips.map((chip) => (
            <span key={`${chip.param}-${chip.value}`} className="chip bg-wash">
              {chip.label}
              <button
                aria-label={`Remove filter ${chip.label}`}
                className="ml-0.5 text-muted hover:text-accent"
                onClick={() => removeChip(chip)}
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

export function sortLabel(value: string): string {
  return SORTS.find((s) => s.value === value)?.label ?? labelFor(value);
}
