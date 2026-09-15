"use server";

// Bulk changes from a list: status, archive, add a tag. Every record still
// gets its own audit entry; the batch is remembered so the whole change can
// be undone from the toast as one.

import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { refreshDigest } from "@/lib/ingest/digest";
import { queueAirtableSync } from "@/lib/airtable/sync";
import { upsertLink, deleteLink } from "@/lib/link-core";
import { STATUS_TYPES, statusOptionsFor, type StatusType, type ArchiveType } from "@/lib/row-status";
import type { LinkPayload } from "@/lib/link-schema";
import { RECORD_REGISTRY, type IngestTargetType } from "@/lib/ingest/registry";
import { coerceField, displayValue, plainValue, sameValue } from "@/lib/record-fields";

const MODEL: Record<string, string> = { creator: "creator", project: "project", format: "format", opportunity: "opportunity", channel: "channel", organization: "organization", person: "industryPerson" };
const NAME: Record<string, string> = { creator: "name", project: "title", format: "title", opportunity: "title", channel: "name", organization: "name", person: "name" };
const TAG_KIND: Record<string, string> = { creator: "creator_entity", project: "project_entity", format: "format_entity", opportunity: "opportunity_entity" };
const MAX = 500;

export type BulkOp =
  | { kind: "status"; status: string }
  | { kind: "archive" }
  | { kind: "tag"; entityId: string; entityName?: string }
  | { kind: "field"; field: string; value: unknown };
export type BulkResult = { ok: true; changed: number; batchId: string; label: string } | { ok: false; error: string };
type Undo = { type: string; id: string; before: Record<string, unknown>; link?: LinkPayload };

export async function bulkApply(type: string, ids: string[], op: BulkOp): Promise<BulkResult> {
  try {
    const user = await requireRole("EDITOR");
    const model = MODEL[type];
    if (!model) return { ok: false, error: "This list does not support bulk changes." };
    const unique = [...new Set(ids)].slice(0, MAX);
    if (!unique.length) return { ok: false, error: "Nothing selected." };
    if (op.kind === "status") {
      if (!(STATUS_TYPES as readonly string[]).includes(type)) return { ok: false, error: "These records have no status." };
      if (!statusOptionsFor(type as StatusType).some((s) => s.value === op.status)) return { ok: false, error: "That status does not exist here." };
    }
    if (op.kind === "tag" && !TAG_KIND[type]) return { ok: false, error: "These records cannot carry tags." };
    const spec = RECORD_REGISTRY[type as IngestTargetType];
    const fieldSpec = op.kind === "field" ? spec?.fields.find((f) => f.name === op.field) : undefined;
    let fieldValue: { value: unknown; plain: ReturnType<typeof plainValue> } | null = null;
    if (op.kind === "field") {
      if (!fieldSpec || (type === "channel" && op.field === "ideas")) return { ok: false, error: "That field cannot be set in bulk." };
      const c = coerceField(fieldSpec, op.value);
      if (!c.ok) return { ok: false, error: c.error };
      fieldValue = { value: c.value, plain: c.plain };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = (db as any)[model];
    const rows: Record<string, unknown>[] = await table.findMany({ where: { id: { in: unique } } });
    const batchId = crypto.randomBytes(6).toString("hex");
    const undo: Undo[] = [];
    let changed = 0;
    for (const row of rows) {
      const id = String(row.id);
      const label = String(row[NAME[type]] ?? "");
      if (op.kind === "status") {
        if (row.status === op.status) continue;
        await table.update({ where: { id }, data: { status: op.status } });
        await logAudit(user, { targetType: type, targetId: id, targetLabel: label, action: "updated", field: "status", oldValue: String(row.status ?? ""), newValue: op.status });
        undo.push({ type, id, before: { status: row.status } });
      } else if (op.kind === "archive") {
        if (row.archived) continue;
        await table.update({ where: { id }, data: { archived: true, archivedReason: "Archived in a bulk change", archivedAt: new Date() } });
        await logAudit(user, { targetType: type, targetId: id, targetLabel: label, action: "archived", newValue: "bulk" });
        undo.push({ type, id, before: { archived: false, archivedReason: row.archivedReason ?? null, archivedAt: row.archivedAt ?? null } });
      } else if (op.kind === "field" && fieldSpec && fieldValue) {
        const before = plainValue(fieldSpec.kind, row[fieldSpec.name]);
        if (sameValue(before, fieldValue.plain)) continue;
        const view = { kind: fieldSpec.kind, options: fieldSpec.vocab?.() };
        await table.update({ where: { id }, data: { [fieldSpec.name]: fieldValue.value, ...(spec.hasVersion ? { version: { increment: 1 } } : {}) } });
        await logAudit(user, { targetType: type, targetId: id, targetLabel: label, action: "updated", field: fieldSpec.name, oldValue: displayValue(view, before).slice(0, 300) || null, newValue: displayValue(view, fieldValue.plain).slice(0, 300) || null });
        undo.push({ type, id, before: { [fieldSpec.name]: row[fieldSpec.name] ?? null } });
      } else if (op.kind === "tag") {
        const payload = { kind: TAG_KIND[type], [`${type}Id`]: id, entityId: op.entityId } as unknown as LinkPayload;
        await upsertLink(payload);
        await logAudit(user, { targetType: type, targetId: id, targetLabel: label, action: "linked", field: "tag", newValue: op.entityName ?? op.entityId });
        undo.push({ type, id, before: {}, link: payload });
      }
      changed++;
      await refreshDigest(type, id).catch(() => {});
      await queueAirtableSync(type, id);
    }
    const record = JSON.parse(JSON.stringify({ type, op, undo, userId: user.id, when: new Date().toISOString() }));
    await db.appSetting.create({ data: { key: `batch:${batchId}`, value: record } });
    revalidatePath("/", "layout");
    const wanted = op.kind === "status" ? op.status : "";
    const statusLabel = wanted ? (statusOptionsFor(type as StatusType).find((s) => s.value === wanted)?.label ?? wanted) : "";
    const label = op.kind === "status" ? `status → ${statusLabel}`
      : op.kind === "archive" ? "moved to the Archive"
      : op.kind === "field" ? `${fieldSpec?.label.toLowerCase() ?? op.field} → ${fieldValue ? displayValue({ kind: fieldSpec!.kind, options: fieldSpec!.vocab?.() }, fieldValue.plain) || "empty" : ""}`
      : `tagged ${op.entityName ?? ""}`.trim();
    return { ok: true, changed, batchId, label };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bulk change failed." };
  }
}

/** Put every record in a batch back the way it was. */
export async function undoBatch(batchId: string): Promise<{ ok: boolean; restored?: number; error?: string }> {
  try {
    const user = await requireRole("EDITOR");
    const row = await db.appSetting.findUnique({ where: { key: `batch:${batchId}` } });
    if (!row) return { ok: false, error: "That change can no longer be undone." };
    const batch = row.value as { type: string; undo: Undo[] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = (db as any)[MODEL[batch.type]];
    let restored = 0;
    for (const u of batch.undo) {
      if (u.link) await deleteLink(u.link);
      else await table.update({ where: { id: u.id }, data: u.before }).catch(() => {});
      await logAudit(user, { targetType: u.type, targetId: u.id, targetLabel: "", action: "restored", field: "bulk undo", newValue: batchId });
      await refreshDigest(u.type, u.id).catch(() => {});
      await queueAirtableSync(u.type, u.id);
      restored++;
    }
    await db.appSetting.delete({ where: { key: `batch:${batchId}` } }).catch(() => {});
    revalidatePath("/", "layout");
    return { ok: true, restored };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Undo failed." };
  }
}

export type { ArchiveType };
