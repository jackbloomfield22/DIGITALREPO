"use client";

// The one typeahead. An input with combobox semantics, a listbox of results
// fetched as you type (debounced, aborted when superseded), arrow keys and
// Enter, and — when the caller allows it — a final "Create 'X'" row when
// nothing matches what was typed. Every picker in the app is this component
// with a different fetcher.

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type ComboItem = { id: string; name: string; sub?: string };

export type ComboboxProps = {
  fetchItems: (q: string, signal: AbortSignal) => Promise<ComboItem[]>;
  onPick: (item: ComboItem) => void | Promise<void>;
  /** Offered when the query matches nothing exactly. */
  onCreate?: (name: string) => void | Promise<void>;
  createLabel?: (name: string) => string;
  /** Shown while the query is empty (recent or suggested items). */
  emptyItems?: ComboItem[];
  exclude?: string[];
  placeholder?: string;
  "aria-label": string;
  autoFocus?: boolean;
  /** Fetch only from this many characters; 0 fetches on focus. */
  minChars?: number;
  /** Rendered between the input and the list — a role select, a type switch. */
  before?: ReactNode;
  className?: string;
  inputClassName?: string;
  listClassName?: string;
  /** Called with the current text as it changes. */
  onQueryChange?: (q: string) => void;
  /** Escape inside the input. */
  onEscape?: () => void;
  busy?: boolean;
  emptyHint?: string;
};

export function Combobox({
  fetchItems, onPick, onCreate, createLabel, emptyItems, exclude, placeholder, autoFocus, minChars = 0, before, className, inputClassName, listClassName, onQueryChange, onEscape, busy, emptyHint,
  "aria-label": ariaLabel,
}: ComboboxProps) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ q: string; items: ComboItem[] } | null>(null);
  const [active, setActive] = useState(0);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const trimmed = q.trim();
  const fetching = trimmed.length >= minChars;

  useEffect(() => {
    if (!fetching) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setPending(true);
      try {
        const items = await fetchItems(trimmed, controller.signal);
        if (!controller.signal.aborted) setResult({ q: trimmed, items });
      } catch { /* superseded */ }
      finally { if (!controller.signal.aborted) setPending(false); }
    }, 150);
    return () => { clearTimeout(t); controller.abort(); };
  }, [trimmed, fetching, fetchItems]);

  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  const excluded = new Set(exclude ?? []);
  const fetched = result?.q === trimmed ? result.items : null;
  const shown = (trimmed || !emptyItems ? fetched ?? [] : emptyItems).filter((i) => !excluded.has(i.id));
  const exact = shown.some((i) => i.name.toLowerCase() === trimmed.toLowerCase());
  const canCreate = !!onCreate && !!trimmed && !exact && fetched !== null;
  const rows: ({ kind: "item"; item: ComboItem } | { kind: "create" })[] = [
    ...shown.map((item) => ({ kind: "item" as const, item })),
    ...(canCreate ? [{ kind: "create" as const }] : []),
  ];
  const clampedActive = Math.min(active, Math.max(0, rows.length - 1));

  const choose = async (row: (typeof rows)[number]) => {
    if (row.kind === "item") await onPick(row.item);
    else if (onCreate) await onCreate(trimmed);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(rows.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { if (rows[clampedActive]) { e.preventDefault(); void choose(rows[clampedActive]); } }
    else if (e.key === "Escape" && onEscape) { e.preventDefault(); e.stopPropagation(); onEscape(); }
  };

  const loading = fetching && fetched === null && (pending || trimmed.length > 0);
  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={rows.length > 0}
        aria-controls={listId}
        aria-activedescendant={rows.length ? `${listId}-${clampedActive}` : undefined}
        placeholder={placeholder ?? "Search…"}
        value={q}
        disabled={busy}
        className={inputClassName}
        onChange={(e) => { setQ(e.target.value); setActive(0); onQueryChange?.(e.target.value); }}
        onKeyDown={onKey}
        autoComplete="off"
      />
      {before}
      <ul id={listId} role="listbox" aria-label={ariaLabel} className={`mt-1 max-h-56 overflow-y-auto ${listClassName ?? ""}`}>
        {rows.map((row, i) => (
          <li
            key={row.kind === "item" ? row.item.id : "__create"}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === clampedActive}
            className={`flex cursor-pointer items-baseline justify-between gap-2 rounded px-2 py-1.5 text-sm ${i === clampedActive ? "bg-wash" : "hover:bg-wash"} ${row.kind === "create" ? "mt-1 border-t border-line text-accent-deep" : ""}`}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void choose(row)}
          >
            {row.kind === "item" ? (
              <><span className="truncate">{row.item.name}</span>{row.item.sub && <span className="shrink-0 text-xs text-muted">{row.item.sub}</span>}</>
            ) : (
              <span>{createLabel ? createLabel(trimmed) : `+ Create “${trimmed}”`}</span>
            )}
          </li>
        ))}
        {loading && <li className="px-2 py-1.5 text-xs text-faint" role="presentation">Searching…</li>}
        {!loading && !rows.length && (
          <li className="px-2 py-1.5 text-xs text-faint" role="presentation">{trimmed ? "No match." : emptyHint ?? "Type to search…"}</li>
        )}
      </ul>
    </div>
  );
}

/** A fetcher for the record lookup API — `/api/lookup?type=…[&kind=…]`. */
export function lookupItems(type: string, kind?: string): ComboboxProps["fetchItems"] {
  return async (q, signal) => {
    const params = new URLSearchParams({ type, q });
    if (kind) params.set("kind", kind);
    const res = await fetch(`/api/lookup?${params}`, { signal });
    if (!res.ok) return [];
    return (await res.json()) as ComboItem[];
  };
}
