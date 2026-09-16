"use client";

// The quick-create sheet: press C (or pick Create in the palette) and get a
// small form with only the essentials for that type — a name, a type or
// status, and a few starting fields. ⌘↩ saves and opens the record, ⌘⇧↩
// saves and starts another. Templates remember a set of select values per
// type so a "podcast format" or "brand brief" starts filled in.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useDialogFocus } from "@/components/overlay";
import { useToast } from "@/components/toast";
import { usePrefs } from "@/components/prefs-provider";
import { createRecord } from "@/lib/actions/quick-create";
import type { CreateType } from "@/lib/record-fields";
import { RECORD_REGISTRY, type EditableField } from "@/lib/ingest/registry";
import type { RecordTemplate } from "@/lib/prefs";

const TYPES: { value: CreateType; label: string; section: string }[] = [
  { value: "creator", label: "Talent", section: "/talent" },
  { value: "project", label: "Project", section: "/projects" },
  { value: "organization", label: "Company", section: "/organizations" },
  { value: "format", label: "Format", section: "/formats" },
  { value: "opportunity", label: "Opportunity", section: "/opportunities" },
  { value: "person", label: "Industry person", section: "/people" },
];

/** The essentials per type: the registry's create fields plus a status where one exists. */
function essentialFields(type: CreateType): EditableField[] {
  const spec = RECORD_REGISTRY[type];
  const names = [...spec.createFields];
  if (spec.fields.some((f) => f.name === "status") && !names.includes("status")) names.unshift("status");
  return names.map((n) => spec.fields.find((f) => f.name === n)).filter((f): f is EditableField => !!f && f.kind !== "longtext" || (!!f && names.length <= 2));
}

type Values = Record<string, string | string[]>;

export function CreateSheet({ isEditor }: { isEditor: boolean }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<CreateType>("format");
  const [values, setValues] = useState<Values>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; href?: string; name?: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { prefs, update } = usePrefs();
  const panel = useDialogFocus(open, () => setOpen(false));

  const spec = RECORD_REGISTRY[type];
  const fields = useMemo(() => essentialFields(type), [type]);
  const templates: RecordTemplate[] = prefs.templates?.[type] ?? [];
  const [naming, setNaming] = useState(false);
  const [templateName, setTemplateName] = useState("");

  useEffect(() => {
    if (!isEditor) return;
    const onOpen = (e: Event) => {
      const section = (e as CustomEvent<{ section?: string; type?: CreateType }>).detail?.section;
      const wanted = (e as CustomEvent<{ type?: CreateType }>).detail?.type ?? TYPES.find((t) => t.section === section)?.value;
      if (wanted) setType(wanted);
      setValues({});
      setError(null);
      setOpen(true);
    };
    window.addEventListener("open-create", onOpen);
    return () => window.removeEventListener("open-create", onOpen);
  }, [isEditor]);

  useEffect(() => { if (open) setTimeout(() => nameRef.current?.focus(), 30); }, [open, type]);

  const set = (name: string, v: string | string[]) => setValues((cur) => ({ ...cur, [name]: v }));

  const save = useCallback(async (then: "open" | "another") => {
    if (busy) return;
    const name = String(values[spec.nameField] ?? "").trim();
    if (!name) { setError({ message: "Give it a name first." }); nameRef.current?.focus(); return; }
    setBusy(true);
    setError(null);
    const res = await createRecord(type, values);
    setBusy(false);
    if (!res.ok) { setError({ message: res.error, href: res.existing?.href, name: res.existing?.name }); return; }
    toast(`Created ${res.name}`);
    if (then === "open") { setOpen(false); router.push(res.href); }
    else { setValues((cur) => keepSelects(cur, fields)); nameRef.current?.focus(); router.refresh(); }
  }, [busy, values, spec.nameField, type, toast, router, fields]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(e.shiftKey ? "another" : "open"); }
  };

  const applyTemplate = (t: RecordTemplate) => setValues((cur) => ({ ...t.values, [spec.nameField]: cur[spec.nameField] ?? "" }));
  const saveTemplate = () => {
    const label = templateName.trim();
    if (!label) return;
    const picked = keepSelects(values, fields);
    const next = [...templates.filter((t) => t.name !== label), { name: label, values: picked }];
    update({ templates: { [type]: next } });
    toast(`Saved template “${label}”`);
    setNaming(false);
    setTemplateName("");
  };
  const removeTemplate = (name: string) => update({ templates: { [type]: templates.filter((t) => t.name !== name) } });

  if (!open || !isEditor) return null;
  return (
    <div className="fixed inset-0 z-[85] flex items-start justify-center p-4 pt-[10vh]">
      <div className="absolute inset-0 bg-ink/40" aria-hidden onClick={() => setOpen(false)} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label="Create a record" tabIndex={-1} className="relative w-full max-w-lg rounded-lg bg-surface p-5 shadow-pop outline-none" onKeyDown={onKey}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">New</h2>
          <div role="tablist" aria-label="Record type" className="flex flex-wrap gap-1">
            {TYPES.map((t) => (
              <button key={t.value} role="tab" type="button" aria-selected={type === t.value} className={`rounded px-2 py-1 text-xs ${type === t.value ? "bg-ink text-paper" : "bg-wash text-muted hover:text-ink"}`} onClick={() => { setType(t.value); setValues((cur) => ({ [RECORD_REGISTRY[t.value].nameField]: cur[spec.nameField] ?? "" })); setError(null); }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {templates.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted">Template:</span>
            {templates.map((t) => (
              <span key={t.name} className="chip !py-0.5">
                <button type="button" onClick={() => applyTemplate(t)} className="hover:text-accent-deep">{t.name}</button>
                <button type="button" aria-label={`Delete template ${t.name}`} className="ml-1 text-faint hover:text-accent" onClick={() => removeTemplate(t.name)}>×</button>
              </span>
            ))}
          </div>
        )}

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-muted">{spec.nameField === "title" ? "Title" : "Name"}</span>
          <input ref={nameRef} value={String(values[spec.nameField] ?? "")} onChange={(e) => set(spec.nameField, e.target.value)} placeholder={`New ${TYPES.find((t) => t.value === type)?.label.toLowerCase()}`} maxLength={300} />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <label key={f.name} className={`block text-sm ${f.kind === "longtext" ? "sm:col-span-2" : ""}`}>
              <span className="mb-1 block text-xs font-semibold text-muted">{f.label}</span>
              {f.kind === "vocab" && (
                <select value={String(values[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)}>
                  <option value="">—</option>
                  {(f.vocab?.() ?? []).filter((o) => o.value).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
              {f.kind === "vocablist" && (
                <select multiple value={Array.isArray(values[f.name]) ? (values[f.name] as string[]) : []} onChange={(e) => set(f.name, [...e.target.selectedOptions].map((o) => o.value))} className="min-h-24">
                  {(f.vocab?.() ?? []).filter((o) => o.value).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
              {f.kind === "longtext" && <textarea rows={3} value={String(values[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)} />}
              {(f.kind === "text" || f.kind === "number" || f.kind === "year" || f.kind === "date" || f.kind === "list") && (
                <input type={f.kind === "number" || f.kind === "year" ? "number" : f.kind === "date" ? "date" : "text"} value={String(values[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)} maxLength={f.maxLength} />
              )}
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-accent-deep">
            {error.message}{" "}
            {error.href && <button type="button" className="underline underline-offset-2" onClick={() => { setOpen(false); router.push(error.href!); }}>Open {error.name}</button>}
          </p>
        )}
        <p className="mt-3 text-xs text-faint">Everything else is filled in on the record page. Fields save when you leave them.</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {naming ? (
            <span className="flex items-center gap-1">
              <input
                autoFocus
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Name this template"
                aria-label="Template name"
                className="!min-h-8 !w-48 text-xs"
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") { e.preventDefault(); saveTemplate(); }
                  if (e.key === "Escape") { e.preventDefault(); setNaming(false); setTemplateName(""); }
                }}
              />
              <button type="button" className="btn btn-primary btn-sm" disabled={!templateName.trim()} onClick={saveTemplate}>Save</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setNaming(false); setTemplateName(""); }}>Cancel</button>
            </span>
          ) : (
            <button type="button" className="text-xs text-muted underline decoration-dotted underline-offset-2 hover:text-ink" onClick={() => setNaming(true)}>Save selects as a template</button>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void save("another")} title="⌘⇧↩">Save &amp; add another</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save("open")} title="⌘↩">{busy ? "Saving…" : "Save & open"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Keep the select-type values (and tags) — that is what a template pre-fills; names and free text do not carry over. */
function keepSelects(values: Values, fields: EditableField[]): Values {
  const out: Values = {};
  for (const f of fields) if ((f.kind === "vocab" || f.kind === "vocablist") && values[f.name]) out[f.name] = values[f.name];
  return out;
}
