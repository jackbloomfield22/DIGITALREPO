"use client";

// The filter picker. Press Filter (or F): a list of fields you can type to
// jump through; pick one, pick an operator for its type, give it a value.
// Filters stack with AND; tick "or" to put one in the OR group instead.
// Select fields with more than fifteen options get a search box.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { matchSorter } from "match-sorter";
import { Modal } from "@/components/overlay";
import { OPERATORS, conditionLabel, type Condition, type FilterField, type FilterOp, type FilterState } from "@/lib/filters";

type LookupItem = { id: string; name: string; sub?: string };

function useLookup(type: string | undefined, kind: string | undefined, q: string) {
  const [result, setResult] = useState<{ q: string; items: LookupItem[] } | null>(null);
  useEffect(() => {
    if (!type) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ type, q });
        if (kind) params.set("kind", kind);
        const res = await fetch(`/api/lookup?${params}`, { signal: controller.signal });
        if (res.ok) setResult({ q, items: (await res.json()) as LookupItem[] });
      } catch { /* typed on */ }
    }, 150);
    return () => { clearTimeout(t); controller.abort(); };
  }, [type, kind, q]);
  return result?.q === q ? result.items : null;
}

function ValueEditor({ field, op, values, onChange, names }: { field: FilterField; op: FilterOp; values: string[]; onChange: (v: string[]) => void; names: Map<string, string> }) {
  const arity = OPERATORS[field.kind].find((o) => o.value === op)?.arity ?? 1;
  const [q, setQ] = useState("");
  const items = useLookup(field.kind === "lookup" ? field.lookupType : undefined, field.lookupKind, q);
  if (arity === 0) return null;
  if (field.kind === "select" || field.kind === "multiselect" || field.kind === "boolean") {
    const options = field.kind === "boolean" ? [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] : field.options ?? [];
    const shown = q ? matchSorter(options, q, { keys: ["label"] }) : options;
    const many = arity === "many";
    return (
      <div>
        {options.length > 15 && <input type="search" className="mb-2 !min-h-9" placeholder="Find an option…" aria-label="Find an option" value={q} onChange={(e) => setQ(e.target.value)} />}
        <div className="max-h-56 overflow-y-auto rounded-md border border-line">
          {shown.map((o) => {
            const on = values.includes(o.value);
            return <label key={o.value} className="filter-option cursor-pointer"><input type={many ? "checkbox" : "radio"} name="value" className="!w-auto" checked={on} onChange={() => onChange(many ? (on ? values.filter((v) => v !== o.value) : [...values, o.value]) : [o.value])} />{o.label}</label>;
          })}
          {!shown.length && <p className="p-2 text-sm text-muted">No option matches.</p>}
        </div>
      </div>
    );
  }
  if (field.kind === "lookup") {
    return (
      <div>
        <input type="search" className="!min-h-9" placeholder={`Find ${field.label.toLowerCase()}…`} aria-label={`Find ${field.label.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {values.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{values.map((v) => <button type="button" key={v} className="chip !min-h-8" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${names.get(v) ?? v}`}>{names.get(v) ?? v} <span aria-hidden>×</span></button>)}</div>}
        <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-line">
          {items === null ? <p className="p-2 text-sm text-muted" role="status">Loading…</p> : items.filter((i) => !values.includes(i.id)).map((i) => (
            <button type="button" key={i.id} className="filter-option" onClick={() => { names.set(i.id, i.name); onChange([...values, i.id]); setQ(""); }}><span className="truncate">{i.name}</span>{i.sub && <span className="ml-auto truncate text-xs text-muted">{i.sub}</span>}</button>
          ))}
          {items && !items.length && <p className="p-2 text-sm text-muted">No matches.</p>}
        </div>
      </div>
    );
  }
  const type = field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text";
  return (
    <div className="flex gap-2">
      <input type={type} className="!min-h-9" aria-label={arity === 2 ? "From" : "Value"} placeholder={field.placeholder} value={values[0] ?? ""} onChange={(e) => onChange(arity === 2 ? [e.target.value, values[1] ?? ""] : [e.target.value])} autoFocus />
      {arity === 2 && <input type={type} className="!min-h-9" aria-label="To" value={values[1] ?? ""} onChange={(e) => onChange([values[0] ?? "", e.target.value])} />}
    </div>
  );
}

export function FilterPicker({ open, onClose, fields, state, onChange, names, initialField }: {
  open: boolean; onClose: () => void; fields: FilterField[]; state: FilterState; onChange: (s: FilterState) => void; names: Map<string, string>; initialField?: string | null;
}) {
  const [q, setQ] = useState("");
  const [field, setField] = useState<FilterField | null>(null);
  const [op, setOp] = useState<FilterOp>("is");
  const [values, setValues] = useState<string[]>([]);
  const [group, setGroup] = useState<"and" | "or">("and");
  const [editing, setEditing] = useState<{ group: "and" | "or"; index: number } | null>(null);
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [seenOpen, setSeenOpen] = useState(false);
  // Fresh each time it opens; a column menu can hand over a field to start on.
  if (open && !seenOpen) {
    setSeenOpen(true);
    const start = initialField ? fields.find((f) => f.key === initialField) ?? null : null;
    setField(start); setOp(start ? OPERATORS[start.kind][0].value : "is"); setValues([]); setQ(""); setGroup("and"); setEditing(null);
  }
  if (!open && seenOpen) setSeenOpen(false);
  const shownFields = useMemo(() => (q ? matchSorter(fields, q, { keys: ["label"] }) : fields), [fields, q]);
  const arity = field ? OPERATORS[field.kind].find((o) => o.value === op)?.arity ?? 1 : 1;
  const valid = !!field && (arity === 0 || (arity === 2 ? values.filter(Boolean).length === 2 : values.filter(Boolean).length >= 1));
  const commit = () => {
    if (!field || !valid) return;
    const cond: Condition = { field: field.key, op, values: arity === 0 ? [] : values.filter(Boolean) };
    const next: FilterState = { and: [...state.and], or: [...state.or] };
    if (editing) next[editing.group].splice(editing.index, 1);
    next[group].push(cond);
    onChange(next);
    setField(null); setValues([]); setQ(""); setEditing(null); setGroup("and");
  };
  const remove = (g: "and" | "or", i: number) => { const next = { and: [...state.and], or: [...state.or] }; next[g].splice(i, 1); onChange(next); };
  const edit = (g: "and" | "or", i: number) => { const c = state[g][i]; const f = fields.find((x) => x.key === c.field); if (!f) return; setField(f); setOp(c.op); setValues(c.values); setGroup(g); setEditing({ group: g, index: i }); };
  const chip = (g: "and" | "or", c: Condition, i: number) => (
    <span key={`${g}-${i}`} className="chip !min-h-8 !whitespace-normal !border-accent/30 !bg-accent-wash">
      <button type="button" className="hover:underline" onClick={() => edit(g, i)}>{conditionLabel(c, fields, names)}</button>
      <button type="button" aria-label={`Remove filter ${conditionLabel(c, fields, names)}`} className="ml-1 px-1" onClick={() => remove(g, i)}>×</button>
    </span>
  );
  return (
    <Modal open={open} onClose={onClose} title="Filter">
      {(state.and.length > 0 || state.or.length > 0) && (
        <div className="mb-4 space-y-2 text-sm">
          {state.and.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><span className="text-xs uppercase tracking-wide text-faint">All of</span>{state.and.map((c, i) => chip("and", c, i))}</div>}
          {state.or.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><span className="text-xs uppercase tracking-wide text-faint">Any of</span>{state.or.map((c, i) => chip("or", c, i))}</div>}
        </div>
      )}
      {!field ? (
        <div>
          <input ref={searchRef} autoFocus type="search" className="!min-h-9" placeholder="Type a field name…" aria-label="Find a field" aria-controls={listId} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && shownFields[0]) { e.preventDefault(); setField(shownFields[0]); setOp(OPERATORS[shownFields[0].kind][0].value); } }} />
          <div id={listId} className="mt-2 max-h-72 overflow-y-auto rounded-md border border-line">
            {shownFields.map((f) => <button type="button" key={f.key} className="filter-option" onClick={() => { setField(f); setOp(OPERATORS[f.kind][0].value); setValues([]); }}><span>{f.label}</span><span className="ml-auto text-xs text-faint">{f.kind === "lookup" ? "record" : f.kind}</span></button>)}
            {!shownFields.length && <p className="p-2 text-sm text-muted">No field matches.</p>}
          </div>
          <div className="mt-3 flex justify-end"><button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Done</button></div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setField(null); setEditing(null); }} aria-label="Choose a different field">‹</button>
            <span className="font-medium">{field.label}</span>
            <select className="!min-h-9 !w-auto" aria-label="Operator" value={op} onChange={(e) => { setOp(e.target.value as FilterOp); setValues([]); }}>
              {OPERATORS[field.kind].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <ValueEditor field={field} op={op} values={values} onChange={setValues} names={names} />
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" className="!w-auto" checked={group === "or"} onChange={(e) => setGroup(e.target.checked ? "or" : "and")} />Match this <em>or</em> another filter in the “any of” group</label>
          <div className="flex justify-end gap-2"><button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Done</button><button type="button" className="btn btn-primary btn-sm" disabled={!valid} onClick={commit}>{editing ? "Update filter" : "Add filter"}</button></div>
        </div>
      )}
    </Modal>
  );
}
