"use client";

// The one select for option sets. The last row is "Create new…": pick it and
// a small input appears; the option is added to the shared set and chosen at
// once, so it exists everywhere that field is used from then on.

import { useState, type SelectHTMLAttributes } from "react";
import { useRouter } from "next/navigation";
import { createOption } from "@/lib/actions/options";
import { useToast } from "@/components/toast";
import type { LabeledValue } from "@/lib/taxonomy";

const CREATE = "__create__";

export function OptionSelect({ setKey, options, value, onChange, allowEmpty = true, emptyLabel = "—", canCreate = true, onCreated, ...rest }: {
  setKey?: string;
  options: LabeledValue[];
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  canCreate?: boolean;
  onCreated?: (o: LabeledValue) => void;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<LabeledValue[]>([]);
  const router = useRouter();
  const { toast } = useToast();
  const all = [...options, ...added.filter((a) => !options.some((o) => o.value === a.value))];
  const known = all.some((o) => o.value === value);

  const create = async () => {
    if (!setKey || !label.trim()) return;
    setBusy(true);
    const res = await createOption(setKey, label);
    setBusy(false);
    if (!res.ok) return toast(res.error, { tone: "error" });
    const o = { value: res.value, label: res.label };
    setAdded((a) => [...a, o]);
    setCreating(false);
    setLabel("");
    onCreated?.(o);
    onChange(res.value);
    toast(res.created ? `Added “${res.label}”` : `Using existing “${res.label}”`);
    router.refresh();
  };

  if (creating) {
    return (
      <span className="flex items-center gap-1">
        <input autoFocus value={label} placeholder="New option…" aria-label="New option name" className="!min-h-8" disabled={busy}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void create(); } if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setCreating(false); } }} />
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !label.trim()} onClick={() => void create()}>Add</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setCreating(false)}>Cancel</button>
      </span>
    );
  }
  return (
    <select {...rest} value={value} onChange={(e) => { if (e.target.value === CREATE) { setCreating(true); return; } onChange(e.target.value); }}>
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {!known && value && <option value={value}>{value}</option>}
      {all.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      {canCreate && setKey && <option value={CREATE}>＋ Create new…</option>}
    </select>
  );
}
