// A record at a glance: what the side panel and the hover cards show. Built
// from the same field registry the editor uses, plus the knowledge index's
// summary of the record's relationships, so every type reads the same way.

import "server-only";
import { db } from "@/lib/db";
import { modelFor } from "@/lib/db-model";
import { RECORD_REGISTRY, type IngestTargetType } from "@/lib/ingest/registry";
import { labelFor } from "@/lib/taxonomy";
import { typeLabel } from "@/lib/record-types";

export type Peek = {
  type: string; id: string; name: string; href: string; typeLabel: string; slug: string;
  status: string | null; archived: boolean; version: number | null;
  fields: { name: string; label: string; value: string; kind: string }[];
  lines: string[];
  updatedAt: string;
};

export async function peekRecord(type: string, id: string): Promise<Peek | null> {
  const spec = RECORD_REGISTRY[type as IngestTargetType];
  if (!spec) return null;
  const record = await modelFor(spec.prismaModel).findUnique({ where: { id } });
  if (!record) return null;
  const digest = await db.knowledgeDigest.findUnique({ where: { targetType_targetId: { targetType: type, targetId: id } }, select: { summary: true } });
  const fields: Peek["fields"] = [];
  for (const f of spec.fields) {
    const v = record[f.name];
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
    const value = v instanceof Date ? v.toISOString().slice(0, 10)
      : Array.isArray(v) ? v.map((x: string) => (f.kind === "vocablist" ? labelFor(x) : x)).join(", ")
      : f.kind === "vocab" ? labelFor(String(v))
      : String(v);
    fields.push({ name: f.name, label: f.label, value: value.length > 240 ? `${value.slice(0, 239)}…` : value, kind: f.kind });
    if (fields.length >= 10) break;
  }
  const name = String(record[spec.nameField] ?? "");
  const lines = (digest?.summary ?? "").split("\n").map((l) => l.trim()).filter((l) => l && l !== name).slice(0, 8);
  return {
    type, id, name, slug: record.slug ?? "", href: spec.path(record.slug ?? ""), typeLabel: typeLabel(type),
    status: typeof record.status === "string" ? record.status : null, archived: !!record.archived,
    version: typeof record.version === "number" ? record.version : null,
    fields, lines, updatedAt: (record.updatedAt instanceof Date ? record.updatedAt : new Date()).toISOString(),
  };
}

/** The same, from a page path such as /talent/some-slug. */
export async function peekByHref(href: string): Promise<Peek | null> {
  const parts = href.split(/[?#]/)[0].split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const type = (Object.keys(RECORD_REGISTRY) as IngestTargetType[]).find((t) => RECORD_REGISTRY[t].path("x").startsWith(`/${parts[0]}/`));
  if (!type) return null;
  const record = await modelFor(RECORD_REGISTRY[type].prismaModel).findUnique({ where: { slug: parts[1] }, select: { id: true } });
  return record ? peekRecord(type, record.id) : null;
}
