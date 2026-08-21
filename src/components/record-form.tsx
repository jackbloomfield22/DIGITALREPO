"use client";

// Config-driven create/edit form shared by projects, organizations, formats,
// opportunities, and industry people.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createFormat, createOpportunity, createOrganization, createPerson, createProject,
  updateFormat, updateOpportunity, updateOrganization, updatePerson, updateProject,
  type RecordResult,
} from "@/lib/actions/records";
import { useToast } from "@/components/toast";
import type { LabeledValue } from "@/lib/taxonomy";

export type FieldDef = {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "number" | "date" | "multicheck" | "url";
  options?: LabeledValue[];
  placeholder?: string;
  rows?: number;
  half?: boolean;
  required?: boolean;
};

export type RecordKind = "project" | "organization" | "format" | "opportunity" | "person";

type Values = Record<string, string | string[] | null>;

/* eslint-disable @typescript-eslint/no-explicit-any */
async function dispatch(
  kind: RecordKind,
  values: Values,
  existing?: { id: string; version: number },
): Promise<RecordResult> {
  if (existing) {
    switch (kind) {
      case "project": return updateProject({ id: existing.id, expectedVersion: existing.version, data: values as any });
      case "organization": return updateOrganization({ id: existing.id, expectedVersion: existing.version, data: values as any });
      case "format": return updateFormat({ id: existing.id, expectedVersion: existing.version, data: values as any });
      case "opportunity": return updateOpportunity({ id: existing.id, expectedVersion: existing.version, data: values as any });
      case "person": return updatePerson({ id: existing.id, data: values as any });
    }
  }
  switch (kind) {
    case "project": return createProject(values as any);
    case "organization": return createOrganization(values as any);
    case "format": return createFormat(values as any);
    case "opportunity": return createOpportunity(values as any);
    case "person": return createPerson(values as any);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const BASE_PATH: Record<RecordKind, string> = {
  project: "/projects",
  organization: "/organizations",
  format: "/formats",
  opportunity: "/opportunities",
  person: "/people",
};

export function RecordForm({
  kind,
  heading,
  fields,
  initial,
}: {
  kind: RecordKind;
  heading: string;
  fields: FieldDef[];
  initial?: { id: string; slug: string; version: number; values: Values };
}) {
  const isEdit = !!initial;
  const [values, setValues] = useState<Values>(() => {
    const v: Values = {};
    for (const f of fields) {
      v[f.name] = initial?.values[f.name] ?? (f.type === "multicheck" ? [] : "");
    }
    return v;
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const set = (name: string, value: string | string[]) => {
    setValues((v) => ({ ...v, [name]: value }));
    setDirty(true);
  };

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const save = useCallback(async () => {
    setSaving(true);
    const res = await dispatch(
      kind,
      values,
      initial ? { id: initial.id, version: initial.version } : undefined,
    );
    setSaving(false);
    if (!res.ok) {
      if (res.conflict) {
        setConflict(`${res.error} Last edited by ${res.conflict.editedBy}. Reload to get the latest version.`);
      } else toast(res.error, { tone: "error" });
      return;
    }
    toast(isEdit ? "Changes saved" : "Created");
    setDirty(false);
    router.push(`${BASE_PATH[kind]}/${res.slug}`);
    router.refresh();
  }, [kind, values, initial, isEdit, router, toast]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);

  return (
    <div className="mx-auto max-w-2xl pb-24">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">{heading}</h1>
        {dirty && <span className="text-sm font-medium text-warn">Unsaved changes</span>}
      </div>

      {conflict && (
        <div className="mb-4 rounded-md border border-accent bg-accent-wash px-4 py-3 text-sm text-accent-deep">
          {conflict}
          <button className="ml-3 font-semibold underline" onClick={() => window.location.reload()}>
            Reload latest
          </button>
        </div>
      )}

      <div className="card grid grid-cols-2 gap-4 p-6">
        {fields.map((f) => (
          <div key={f.name} className={f.half ? "col-span-1" : "col-span-2"}>
            <label htmlFor={`rf-${f.name}`}>
              {f.label}
              {f.required ? " *" : ""}
            </label>
            {f.type === "textarea" ? (
              <textarea
                id={`rf-${f.name}`}
                rows={f.rows ?? 4}
                className="mt-1"
                placeholder={f.placeholder}
                value={(values[f.name] as string) ?? ""}
                onChange={(e) => set(f.name, e.target.value)}
              />
            ) : f.type === "select" ? (
              <select
                id={`rf-${f.name}`}
                className="mt-1"
                value={(values[f.name] as string) ?? ""}
                onChange={(e) => set(f.name, e.target.value)}
              >
                <option value="">—</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : f.type === "multicheck" ? (
              <div className="mt-1 grid grid-cols-2 gap-1">
                {f.options?.map((o) => {
                  const selected = ((values[f.name] as string[]) ?? []).includes(o.value);
                  return (
                    <label key={o.value} className="flex items-center gap-2 text-sm font-normal">
                      <input
                        type="checkbox"
                        className="!w-auto"
                        checked={selected}
                        onChange={(e) => {
                          const current = (values[f.name] as string[]) ?? [];
                          set(
                            f.name,
                            e.target.checked
                              ? [...current, o.value]
                              : current.filter((x) => x !== o.value),
                          );
                        }}
                      />
                      {o.label}
                    </label>
                  );
                })}
              </div>
            ) : (
              <input
                id={`rf-${f.name}`}
                type={f.type}
                className="mt-1"
                placeholder={f.placeholder}
                value={(values[f.name] as string) ?? ""}
                onChange={(e) => set(f.name, e.target.value)}
                required={f.required}
              />
            )}
          </div>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:left-52">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm text-muted">{dirty ? "Unsaved changes" : ""}</span>
          <div className="flex gap-2">
            <button
              className="btn btn-secondary"
              onClick={() => {
                if (dirty && !window.confirm("Discard unsaved changes?")) return;
                setDirty(false);
                router.push(isEdit ? `${BASE_PATH[kind]}/${initial!.slug}` : BASE_PATH[kind]);
              }}
            >
              Cancel
            </button>
            <button className="btn btn-primary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
