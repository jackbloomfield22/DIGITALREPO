"use client";

// The Highlights block at the top of a record's Overview: up to six key
// fields, each editable in place.

import { InlineField } from "@/components/inline-field";
import type { DetailField } from "@/lib/record-fields";

export function Highlights({ type, id, fields, canEdit }: { type: string; id: string; fields: DetailField[]; canEdit: boolean }) {
  const shown = fields.slice(0, 6);
  if (!shown.length) return null;
  return (
    <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-3 rounded-md border border-line bg-surface px-4 py-3 sm:grid-cols-3" aria-label="Highlights">
      {shown.map((f) => (
        <div key={f.name} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{f.label}</dt>
          <dd className="mt-0.5 truncate text-sm"><InlineField type={type} id={id} field={f} canEdit={canEdit} /></dd>
        </div>
      ))}
    </dl>
  );
}
