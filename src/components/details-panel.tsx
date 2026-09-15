"use client";

// Every editable field of a record in one column: the ones with a value,
// then "Show N empty fields" for the rest. Long lists get a search box.

import { useMemo, useState } from "react";
import { matchSorter } from "match-sorter";
import { InlineField } from "@/components/inline-field";
import { isEmptyValue, type DetailField } from "@/lib/record-fields";

export function DetailsPanel({ type, id, fields, canEdit, title = "Details" }: {
  type: string; id: string; fields: DetailField[]; canEdit: boolean; title?: string;
}) {
  const [showEmpty, setShowEmpty] = useState(false);
  const [q, setQ] = useState("");
  const filled = fields.filter((f) => !isEmptyValue(f.value));
  const empty = fields.filter((f) => isEmptyValue(f.value));
  const searchable = fields.length > 12;
  const visible = useMemo(() => {
    const list = showEmpty || q ? fields : filled;
    return q ? matchSorter(list, q, { keys: ["label", "name"] }) : list;
  }, [fields, filled, showEmpty, q]);
  if (!fields.length) return null;
  return (
    <section className="card p-4" aria-label={title}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="overline">{title}</div>
        {searchable && <input type="search" className="!min-h-7 !w-32 !py-0.5 !text-xs" placeholder="Find a field" aria-label="Find a field" value={q} onChange={(e) => setQ(e.target.value)} />}
      </div>
      {visible.length === 0 && <p className="text-sm text-faint">{q ? "No field matches." : canEdit ? "Nothing filled in yet." : "Nothing here yet."}</p>}
      <dl className="divide-y divide-line/70">
        {visible.map((f) => (
          <div key={f.name} className={`grid gap-x-3 py-1.5 text-sm ${f.kind === "longtext" ? "grid-cols-1" : "grid-cols-[minmax(6rem,38%)_1fr]"}`}>
            <dt className="truncate pt-0.5 text-muted" title={f.description ?? f.label}>{f.label}</dt>
            <dd className="min-w-0 break-words"><InlineField type={type} id={id} field={f} canEdit={canEdit} /></dd>
          </div>
        ))}
      </dl>
      {canEdit && empty.length > 0 && !q && (
        <button type="button" className="mt-2 text-xs text-muted underline decoration-dotted underline-offset-2 hover:text-accent-deep" onClick={() => setShowEmpty((v) => !v)}>
          {showEmpty ? "Hide empty fields" : `Show ${empty.length} empty field${empty.length === 1 ? "" : "s"}`}
        </button>
      )}
    </section>
  );
}
