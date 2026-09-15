"use server";

// One field at a time, from wherever you are looking at it. Every inline
// editor on a record page lands here: the value is coerced for its column,
// the record's version is checked so two people cannot silently overwrite
// each other, the change is audited, the digest refreshed and Airtable
// queued — the same path every other edit takes.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { queueAirtableSync } from "@/lib/airtable/sync";
import { RECORD_REGISTRY, type IngestTargetType } from "@/lib/ingest/registry";
import { coerceField, displayValue, plainValue, sameValue, type DetailField } from "@/lib/record-fields";

export type SetFieldResult =
  | { ok: true; version: number | null; value: DetailField["value"]; changed: boolean }
  | { ok: false; error: string; conflict?: { editedBy: string; version: number } };

const DATED = new Set(["project", "format", "opportunity", "channel"]);

/** Who last touched the record, for the conflict message. */
async function lastEditor(targetType: string, targetId: string): Promise<string> {
  const row = await db.auditLog.findFirst({ where: { targetType, targetId }, orderBy: { createdAt: "desc" }, select: { userName: true } });
  return row?.userName ?? "someone else";
}

export async function setField(input: {
  type: string;
  id: string;
  field: string;
  value: unknown;
  expectedVersion?: number | null;
}): Promise<SetFieldResult> {
  try {
    const user = await requireRole("EDITOR");
    const spec = RECORD_REGISTRY[input.type as IngestTargetType];
    if (!spec) return { ok: false, error: "Unknown record type." };
    const isName = input.field === spec.nameField;
    const field = isName
      ? { name: spec.nameField, label: "Name", kind: "text" as const, maxLength: 300 }
      : spec.fields.find((f) => f.name === input.field);
    if (!field) return { ok: false, error: `${input.field} cannot be edited here.` };
    if (input.type === "channel" && input.field === "ideas") return { ok: false, error: "Ideas are edited in their own list." };

    const coerced = coerceField(field, input.value);
    if (!coerced.ok) return { ok: false, error: coerced.error };
    if (isName && !coerced.plain) return { ok: false, error: "A name is required." };
    if (field.name === "status" && !coerced.plain) return { ok: false, error: "A status is required." };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (db as any)[spec.prismaModel];
    const current = await model.findUnique({ where: { id: input.id } });
    if (!current) return { ok: false, error: "That record is no longer here." };

    const version: number | null = spec.hasVersion ? Number(current.version) : null;
    if (spec.hasVersion && input.expectedVersion != null && version !== input.expectedVersion) {
      return { ok: false, error: "This record changed since you opened it.", conflict: { editedBy: await lastEditor(input.type, input.id), version: version! } };
    }

    const before = plainValue(field.kind, current[field.name]);
    if (sameValue(before, coerced.plain)) return { ok: true, version, value: before, changed: false };

    const data: Record<string, unknown> = { [field.name]: coerced.value };
    if (spec.hasVersion) data.version = { increment: 1 };
    if (field.name === "status" && DATED.has(input.type)) data.lastActivityAt = new Date();
    const updated = await model.update({ where: { id: input.id }, data });

    const fieldView = { kind: field.kind, options: "vocab" in field && field.vocab ? field.vocab() : undefined };
    await logAudit(user, {
      targetType: input.type,
      targetId: input.id,
      targetLabel: String(updated[spec.nameField] ?? current[spec.nameField] ?? ""),
      action: "updated",
      field: field.name,
      oldValue: displayValue(fieldView, before).slice(0, 300) || null,
      newValue: displayValue(fieldView, coerced.plain).slice(0, 300) || null,
    });
    await queueAirtableSync(input.type, input.id);
    revalidatePath("/", "layout");
    return { ok: true, version: spec.hasVersion ? Number(updated.version) : null, value: coerced.plain, changed: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save that." };
  }
}
