// The mirror itself. A change on the Repo drops a job for that record; the
// jobs are worked straight after the request that caused them, and again by
// a daily pass that re-checks every record. Each push compares a hash of the
// row to the last one sent, so nothing that has not changed costs a request,
// and files are copied once and remembered by their Airtable id.

import "server-only";
import crypto from "crypto";
import { db } from "@/lib/db";
import { airtable, AirtableError, DIRECT_UPLOAD_LIMIT, repoIdFormula, type AirtableAttachment, type AirtableTable } from "@/lib/airtable/client";
import { airtableConfig, airtableReady, airtableToken, siteOrigin, type AirtableConfig } from "@/lib/airtable/config";
import { FIELD, airtableRecordUrl, buildFields, fieldSpecs, stableStringify, type MirrorSource, type MirrorType } from "@/lib/airtable/fields";
import { signedFetchUrl } from "@/lib/airtable/fetch-url";
import { signedUrlFor } from "@/lib/files";
import { labelFor, FORMAT_STATUSES, FORMAT_TYPES, PROJECT_STATUSES, PROJECT_TYPES } from "@/lib/taxonomy";
import type { LinkPayload } from "@/lib/link-schema";

export const MIRRORED: readonly string[] = ["format", "project"];
export const isMirrored = (t: string): t is MirrorType => MIRRORED.includes(t);

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

/** Tests switch this off so a queued job waits for an explicit drain. */
let autoDrain = true;
export function setAutoDrain(v: boolean) { autoDrain = v; }

/**
 * Note that a record needs pushing. Cheap and safe to call from anywhere a
 * format or project changes; it does nothing when the mirror is not set up.
 */
export async function queueAirtableSync(targetType: string, targetId: string, opts: { reason?: "changed" | "deleted" | "forced"; removeIds?: string[] } = {}): Promise<void> {
  if (!isMirrored(targetType)) return;
  if (!(await airtableReady())) return;
  const reason = opts.reason ?? "changed";
  const removeIds = opts.removeIds ?? [];
  try {
    await db.airtableJob.upsert({
      where: { targetType_targetId: { targetType, targetId } },
      create: { targetType, targetId, reason, removeIds },
      update: {
        // A delete outranks a change; a forced push outranks a plain one.
        reason: reason === "deleted" ? "deleted" : reason === "forced" ? "forced" : undefined,
        removeIds: removeIds.length ? { push: removeIds } : undefined,
      },
    });
  } catch (e) {
    console.error("Could not queue an Airtable sync:", e);
    return;
  }
  if (autoDrain) scheduleDrain();
}

/** Queue the record on each side of a link that touches a format or project. */
export async function queueAirtableForLink(p: LinkPayload): Promise<void> {
  const rec = p as unknown as Record<string, unknown>;
  if (typeof rec.formatId === "string") await queueAirtableSync("format", rec.formatId);
  if (typeof rec.projectId === "string") await queueAirtableSync("project", rec.projectId);
}

function scheduleDrain() {
  // A small batch: this runs in the tail of a request, and a claimed job that
  // gets cut off is picked up again by the next push or the nightly pass.
  const run = () => drainAirtableQueue({ limit: 10 }).catch((e) => console.error("Airtable drain failed:", e));
  // Inside a request, run once the response has gone out; anywhere else, just run.
  import("next/server")
    .then(({ after }) => { try { after(run); } catch { void run(); } })
    .catch(() => { void run(); });
}

export type DrainSummary = { synced: number; failed: number; skipped: number; remaining: number; errors: { targetType: string; targetId: string; error: string }[] };

const MAX_ATTEMPTS = 6;
const CLAIM_STALE_MS = 3 * 60_000;

/** Work the queue, oldest first. Two runners never take the same job: each is claimed with a timestamp first. */
export async function drainAirtableQueue(opts: { limit?: number } = {}): Promise<DrainSummary> {
  const out: DrainSummary = { synced: 0, failed: 0, skipped: 0, remaining: 0, errors: [] };
  if (!(await airtableReady())) return out;
  const limit = opts.limit ?? 25;
  const jobs = await db.airtableJob.findMany({
    where: { attempts: { lt: MAX_ATTEMPTS }, OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(Date.now() - CLAIM_STALE_MS) } }] },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  for (const job of jobs) {
    const claimed = await db.airtableJob.updateMany({
      where: { id: job.id, OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(Date.now() - CLAIM_STALE_MS) } }] },
      data: { claimedAt: new Date() },
    });
    if (claimed.count !== 1) { out.skipped++; continue; }
    try {
      const result = await syncRecord(job.targetType as MirrorType, job.targetId, { reason: job.reason as "changed" | "deleted" | "forced", removeIds: job.removeIds });
      if (result === "skipped") out.skipped++; else out.synced++;
      await db.airtableJob.delete({ where: { id: job.id } }).catch(() => {});
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      out.failed++;
      out.errors.push({ targetType: job.targetType, targetId: job.targetId, error: message });
      await db.airtableJob.update({ where: { id: job.id }, data: { attempts: { increment: 1 }, lastError: message.slice(0, 1000), claimedAt: null } }).catch(() => {});
      await db.airtableSync.updateMany({ where: { targetType: job.targetType, targetId: job.targetId }, data: { error: message.slice(0, 1000), errorAt: new Date() } }).catch(() => {});
      // A bad token or a missing base fails every job the same way; stop here rather than burn the rest.
      if (e instanceof AirtableError && (e.status === 401 || e.status === 403 || e.status === 404)) break;
    }
  }
  out.remaining = await db.airtableJob.count({ where: { attempts: { lt: MAX_ATTEMPTS } } });
  return out;
}

/** Put every live format and project on the queue, plus archived ones that already have a row. A daily job and the admin button use this. */
export async function queueEverything(): Promise<number> {
  const cfg = await airtableReady();
  if (!cfg) return 0;
  const rows: { targetType: string; targetId: string }[] = [];
  if (cfg.enabled.format) {
    const live = await db.format.findMany({ where: { archived: false }, select: { id: true } });
    rows.push(...live.map((r) => ({ targetType: "format", targetId: r.id })));
  }
  if (cfg.enabled.project) {
    const live = await db.project.findMany({ where: { archived: false }, select: { id: true } });
    rows.push(...live.map((r) => ({ targetType: "project", targetId: r.id })));
  }
  const synced = await db.airtableSync.findMany({ select: { targetType: true, targetId: true } });
  const seen = new Set(rows.map((r) => `${r.targetType}:${r.targetId}`));
  for (const s of synced) if (!seen.has(`${s.targetType}:${s.targetId}`)) { rows.push(s); seen.add(`${s.targetType}:${s.targetId}`); }
  if (rows.length) await db.airtableJob.createMany({ data: rows.map((r) => ({ ...r, reason: "changed" })), skipDuplicates: true });
  return rows.length;
}

// ---------------------------------------------------------------------------
// Loading a record as a row
// ---------------------------------------------------------------------------

export async function loadMirrorSource(type: MirrorType, id: string): Promise<MirrorSource | null> {
  const files = await db.attachment.findMany({
    where: { targetType: type, targetId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, filename: true, mimeType: true, sizeBytes: true, airtableAttachmentId: true },
  });
  if (type === "format") {
    const f = await db.format.findUnique({
      where: { id },
      include: {
        organizations: { include: { organization: { select: { name: true } } } },
        people: { include: { person: { select: { name: true, organizations: { take: 1, include: { organization: { select: { name: true } } } } } } } },
        creators: { include: { creator: { select: { name: true } } } },
      },
    });
    if (!f) return null;
    return {
      type, id: f.id, slug: f.slug, title: f.title, status: f.status, statusLabel: labelFor(f.status),
      kind: f.formatType, kindLabel: f.formatType ? labelFor(f.formatType) : null, logline: f.logline,
      companies: uniq(f.organizations.map((o) => o.organization.name)),
      people: uniq(f.people.map((p) => personLine(p.person.name, p.role, p.person.organizations[0]?.organization.name))),
      talent: uniq(f.creators.map((c) => c.creator.name)),
      archived: f.archived, archivedReason: f.archivedReason, lastActivityAt: f.lastActivityAt, updatedAt: f.updatedAt, files,
    };
  }
  const p = await db.project.findUnique({
    where: { id },
    include: {
      organizations: { include: { organization: { select: { name: true } } } },
      people: { include: { person: { select: { name: true, organizations: { take: 1, include: { organization: { select: { name: true } } } } } } } },
      credits: { include: { creator: { select: { name: true } } } },
    },
  });
  if (!p) return null;
  return {
    type, id: p.id, slug: p.slug, title: p.title, status: p.status, statusLabel: labelFor(p.status),
    kind: p.projectType, kindLabel: p.projectType ? labelFor(p.projectType) : null, logline: p.logline,
    companies: uniq(p.organizations.map((o) => o.organization.name)),
    people: uniq(p.people.map((x) => personLine(x.person.name, x.role, x.person.organizations[0]?.organization.name))),
    talent: uniq(p.credits.map((c) => c.creator.name)),
    archived: p.archived, archivedReason: p.archivedReason, lastActivityAt: p.lastActivityAt, updatedAt: p.updatedAt, files,
  };
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];
const personLine = (name: string, role: string | null, company?: string) =>
  [name, role ? labelFor(role) : null].filter(Boolean).join(" — ") + (company ? ` (${company})` : "");

const hashOf = (fields: Record<string, unknown>) => crypto.createHash("sha1").update(stableStringify(fields)).digest("hex");

// ---------------------------------------------------------------------------
// Pushing one record
// ---------------------------------------------------------------------------

type TableRef = { id: string; name: string; nameField: string; hasFiles: boolean; hasSyncNote: boolean };
let tableCache: { at: number; baseId: string; tables: AirtableTable[] } | null = null;

async function tableFor(cfg: AirtableConfig, type: MirrorType): Promise<TableRef> {
  const wanted = cfg.tables[type];
  if (!tableCache || tableCache.baseId !== cfg.baseId || Date.now() - tableCache.at > 5 * 60_000) {
    tableCache = { at: Date.now(), baseId: cfg.baseId, tables: await airtable.listTables(cfg.baseId) };
  }
  const table = tableCache.tables.find((t) => t.name === wanted || t.id === wanted);
  if (!table) throw new AirtableError(404, `No table called "${wanted}" in the Airtable base. Set it up from Admin → Airtable.`);
  const primary = table.fields.find((f) => f.id === table.primaryFieldId);
  const names = new Set(table.fields.map((f) => f.name));
  const missing = [FIELD.status, FIELD.repoLink, FIELD.repoId].filter((n) => !names.has(n));
  if (missing.length) throw new AirtableError(422, `The "${table.name}" table is missing fields: ${missing.join(", ")}. Run set-up from Admin → Airtable.`);
  return { id: table.id, name: table.name, nameField: primary?.name ?? FIELD.name, hasFiles: names.has(FIELD.files), hasSyncNote: names.has(FIELD.syncNote) };
}

export function forgetAirtableTables() { tableCache = null; }

/**
 * Push one record. Returns "synced" when Airtable was touched, "skipped" when
 * nothing had changed or the type is switched off. Throws on an API failure,
 * with a message a person can act on.
 */
export async function syncRecord(type: MirrorType, id: string, opts: { reason?: "changed" | "deleted" | "forced"; removeIds?: string[] } = {}): Promise<"synced" | "skipped"> {
  const cfg = await airtableReady();
  if (!cfg) return "skipped";
  const reason = opts.reason ?? "changed";
  const existing = await db.airtableSync.findUnique({ where: { targetType_targetId: { targetType: type, targetId: id } } });
  const src = reason === "deleted" ? null : await loadMirrorSource(type, id);

  if (!src) {
    // Gone from the Repo. The row stays, marked, so nobody wonders where it went.
    if (!existing) return "skipped";
    const table = await tableFor(cfg, type);
    const fields: Record<string, unknown> = { [FIELD.archived]: true };
    if (table.hasSyncNote) fields[FIELD.syncNote] = `Deleted from the Repo on ${new Date().toISOString().slice(0, 10)}`;
    await airtable.updateRecord(cfg.baseId, table.id, existing.recordId, fields);
    await db.airtableSync.delete({ where: { id: existing.id } });
    return "synced";
  }
  if (!cfg.enabled[type]) return "skipped";

  const table = await tableFor(cfg, type);
  const fields = buildFields(src, siteOrigin(), table.nameField);
  if (!table.hasSyncNote) delete fields[FIELD.syncNote];
  const hash = hashOf(fields);
  let recordId = existing?.recordId ?? null;
  let touched = false;

  // Find the row: what we remembered, else a row already carrying this Repo
  // ID, else a new one. A remembered row is trusted until Airtable says it is
  // gone, so an unchanged record costs no request at all.
  const unchanged = !!existing && existing.tableId === table.id && existing.fieldsHash === hash && reason !== "forced";
  const locate = async () => {
    const found = await airtable.findByFormula(cfg.baseId, table.id, repoIdFormula(FIELD.repoId, `${type}:${id}`));
    return found[0]?.id ?? null;
  };
  if (recordId && !unchanged) {
    try {
      await airtable.updateRecord(cfg.baseId, table.id, recordId, fields);
      touched = true;
    } catch (e) {
      if (e instanceof AirtableError && e.status === 404) recordId = null; else throw e;
    }
  }
  if (!recordId) {
    recordId = await locate();
    if (recordId) await airtable.updateRecord(cfg.baseId, table.id, recordId, fields);
    else recordId = (await airtable.createRecord(cfg.baseId, table.id, fields)).id;
    touched = true;
  }

  await db.airtableSync.upsert({
    where: { targetType_targetId: { targetType: type, targetId: id } },
    create: { targetType: type, targetId: id, tableName: table.name, tableId: table.id, recordId, fieldsHash: hash, syncedAt: new Date(), error: null, errorAt: null },
    update: { tableName: table.name, tableId: table.id, recordId, fieldsHash: hash, syncedAt: new Date(), error: null, errorAt: null },
  });

  if (table.hasFiles) {
    const filesTouched = await syncFiles(cfg, table, recordId, src, opts.removeIds ?? []);
    touched = touched || filesTouched;
  }
  return touched ? "synced" : "skipped";
}

/** Copy new files onto the row, take deleted ones off it, leave anything the team added in Airtable alone. */
async function syncFiles(cfg: AirtableConfig, table: TableRef, recordId: string, src: MirrorSource, removeIds: string[]): Promise<boolean> {
  const pending = src.files.filter((f) => !f.airtableAttachmentId);
  if (!pending.length && !removeIds.length) return false;

  const current = await airtable.getRecord(cfg.baseId, table.id, recordId);
  let list = ((current.fields[FIELD.files] as AirtableAttachment[] | undefined) ?? []).slice();
  let touched = false;

  if (removeIds.length) {
    const drop = new Set(removeIds);
    const kept = list.filter((a) => !drop.has(a.id));
    if (kept.length !== list.length) {
      const updated = await airtable.updateRecord(cfg.baseId, table.id, recordId, { [FIELD.files]: kept.map((a) => ({ id: a.id })) });
      list = (updated.fields[FIELD.files] as AirtableAttachment[] | undefined) ?? [];
      touched = true;
    }
  }

  for (const file of pending) {
    const before = new Set(list.map((a) => a.id));
    const size = file.sizeBytes ?? 0;
    let after: AirtableAttachment[];
    if (size > 0 && size <= DIRECT_UPLOAD_LIMIT) {
      const bytes = await readAttachmentBytes(file.id);
      if (!bytes) continue; // the bytes are gone (a restore without files); nothing to send
      const res = await airtable.uploadAttachment(cfg.baseId, recordId, FIELD.files, {
        contentType: file.mimeType ?? "application/octet-stream", filename: file.filename, bytes,
      });
      after = Object.values(res.fields)[0] ?? [];
    } else {
      const updated = await airtable.updateRecord(cfg.baseId, table.id, recordId, {
        [FIELD.files]: [...list.map((a) => ({ id: a.id })), { url: signedFetchUrl(file.id), filename: file.filename }],
      });
      after = (updated.fields[FIELD.files] as AirtableAttachment[] | undefined) ?? [];
    }
    const added = after.find((a) => !before.has(a.id) && (a.filename === file.filename || after.filter((x) => !before.has(x.id)).length === 1)) ?? after.find((a) => !before.has(a.id));
    list = after;
    touched = true;
    await db.attachment.update({ where: { id: file.id }, data: { airtableAttachmentId: added?.id ?? null, airtableSyncedAt: new Date() } }).catch(() => {});
  }
  return touched;
}

/** The bytes of one attachment, wherever they live. Null when they are missing. */
export async function readAttachmentBytes(attachmentId: string): Promise<Uint8Array | null> {
  const a = await db.attachment.findUnique({ where: { id: attachmentId } });
  if (!a) return null;
  if (a.storage === "blob") {
    const url = await signedUrlFor(a.storedPath);
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  }
  const stored = await db.storedFile.findUnique({ where: { key: a.storedPath } });
  if (!stored || (stored.data.byteLength === 0 && stored.sizeBytes > 0)) return null;
  return new Uint8Array(stored.data);
}

// ---------------------------------------------------------------------------
// What the page and the admin screen show
// ---------------------------------------------------------------------------

export type AirtableState = {
  configured: boolean;
  enabled: boolean;
  recordUrl: string | null;
  syncedAt: Date | null;
  error: string | null;
  queued: boolean;
};

export async function airtableStateFor(type: string, id: string): Promise<AirtableState> {
  const off: AirtableState = { configured: false, enabled: false, recordUrl: null, syncedAt: null, error: null, queued: false };
  if (!isMirrored(type)) return off;
  const cfg = await airtableReady();
  if (!cfg) return off;
  const [sync, job] = await Promise.all([
    db.airtableSync.findUnique({ where: { targetType_targetId: { targetType: type, targetId: id } } }),
    db.airtableJob.findUnique({ where: { targetType_targetId: { targetType: type, targetId: id } } }),
  ]);
  return {
    configured: true,
    enabled: cfg.enabled[type],
    recordUrl: sync ? airtableRecordUrl(cfg.baseId, sync.tableId, sync.recordId) : null,
    syncedAt: sync?.syncedAt ?? null,
    error: job?.lastError ?? sync?.error ?? null,
    queued: !!job,
  };
}

export type ConnectionReport = {
  ok: boolean;
  tokenPresent: boolean;
  baseId: string;
  problem: string | null;
  tables: { type: MirrorType; wanted: string; found: boolean; tableId: string | null; primaryField: string | null; missingFields: string[] }[];
};

/** Can the mirror reach the base, and does each table have what it needs? */
export async function checkConnection(): Promise<ConnectionReport> {
  const cfg = await airtableConfig();
  const report: ConnectionReport = { ok: false, tokenPresent: !!airtableToken(), baseId: cfg.baseId, problem: null, tables: [] };
  if (!report.tokenPresent) { report.problem = "No token. Add AIRTABLE_TOKEN in Vercel → Settings → Environment Variables, then redeploy."; return report; }
  if (!cfg.baseId) { report.problem = "No base id. Paste the base id (it starts with \"app\") below, or set AIRTABLE_BASE_ID in Vercel."; return report; }
  let tables: AirtableTable[];
  try {
    tables = await airtable.listTables(cfg.baseId);
    tableCache = { at: Date.now(), baseId: cfg.baseId, tables };
  } catch (e) {
    const err = e instanceof AirtableError ? e : null;
    report.problem =
      err?.status === 401 ? "Airtable rejected the token. Check AIRTABLE_TOKEN, and that it has the data.records:read, data.records:write and schema.bases:read scopes." :
      err?.status === 403 ? "The token cannot see this base. When creating the token in Airtable, add this base under Access." :
      err?.status === 404 ? "No base with that id. It starts with \"app\" and is in the base's URL after airtable.com/." :
      `Airtable could not be reached: ${e instanceof Error ? e.message : String(e)}`;
    return report;
  }
  const wantedFields = fieldSpecs("format", { statuses: [], types: [] }).map((f) => f.name);
  for (const type of ["format", "project"] as MirrorType[]) {
    const wanted = cfg.tables[type];
    const t = tables.find((x) => x.name === wanted || x.id === wanted);
    if (!t) { report.tables.push({ type, wanted, found: false, tableId: null, primaryField: null, missingFields: wantedFields }); continue; }
    const names = new Set(t.fields.map((f) => f.name));
    const primary = t.fields.find((f) => f.id === t.primaryFieldId)?.name ?? null;
    // The primary field stands in for "Name"; it is never missing.
    const missing = wantedFields.filter((n) => n !== FIELD.name && !names.has(n));
    report.tables.push({ type, wanted, found: true, tableId: t.id, primaryField: primary, missingFields: missing });
  }
  report.ok = report.tables.every((t) => t.found && t.missingFields.length === 0);
  return report;
}

export type SetupReport = { ok: boolean; created: string[]; problem: string | null };

/** Create the tables and fields the mirror needs, where they are missing. Needs a token with schema.bases:write. */
export async function setupTables(): Promise<SetupReport> {
  const before = await checkConnection();
  const out: SetupReport = { ok: false, created: [], problem: before.problem };
  if (before.problem) return out;
  const cfg = await airtableConfig();
  const choices = {
    format: { statuses: FORMAT_STATUSES.map((s) => s.label), types: FORMAT_TYPES.map((s) => s.label) },
    project: { statuses: PROJECT_STATUSES.map((s) => s.label), types: PROJECT_TYPES.map((s) => s.label) },
  };
  try {
    for (const t of before.tables) {
      const specs = fieldSpecs(t.type, choices[t.type]);
      if (!t.found) {
        await airtable.createTable(cfg.baseId, t.wanted, specs);
        out.created.push(`table "${t.wanted}" with all its fields`);
        continue;
      }
      for (const name of t.missingFields) {
        const spec = specs.find((s) => s.name === name);
        if (!spec || !t.tableId) continue;
        await airtable.createField(cfg.baseId, t.tableId, spec);
        out.created.push(`"${name}" on "${t.wanted}"`);
      }
    }
  } catch (e) {
    const err = e instanceof AirtableError ? e : null;
    out.problem = err?.status === 403
      ? "The token is not allowed to change the base's structure. Either add the schema.bases:write scope to it, or create the missing fields by hand with exactly these names: " + before.tables.flatMap((t) => t.missingFields).join(", ")
      : `Airtable refused: ${e instanceof Error ? e.message : String(e)}`;
    tableCache = null;
    return out;
  }
  tableCache = null;
  const after = await checkConnection();
  out.ok = after.ok;
  out.problem = after.ok ? null : "Some fields are still missing: " + after.tables.flatMap((t) => t.missingFields.map((f) => `${f} (${t.wanted})`)).join(", ");
  return out;
}
