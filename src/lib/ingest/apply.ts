// Apply engine: turns approved/edited IngestChange rows into real database
// mutations through the existing resolve helpers, audit chokepoint, and link
// engine — in dependency order, with optimistic-concurrency conflict handling
// and Source attribution back to the ingest item.

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { clearDigestMemo, refreshDigest } from "@/lib/ingest/digest";
import { resolveByType, resolveEntity } from "@/lib/ingest/resolve";
import { LINK_SPECS, RECORD_REGISTRY, type IngestTargetType } from "@/lib/ingest/registry";
import { splitList, type ProposedOp } from "@/lib/ingest/ops";
import { convertRecord, type ConvertOutcome } from "@/lib/convert";
import { labelFor } from "@/lib/taxonomy";
import type { SessionUser } from "@/lib/roles";
import type { LinkPayload } from "@/lib/link-schema";

export type ApplyOutcome = {
  applied: number;
  failed: number;
  superseded: number;
  touched: { targetType: string; targetId: string; name: string; path: string | null }[];
};

// Restores first so a revived record can then be edited; a move last so every
// edit lands on the record before it is carried across.
const STAGE_ORDER: Record<string, number> = {
  restore: 0, create: 1, rename: 2, update: 3, unlink: 4, link: 5, note: 6, archive: 7, convert: 8,
};

type Touched = Map<string, { targetType: string; targetId: string; name: string; path: string | null }>;

function touch(touched: Touched, targetType: IngestTargetType, targetId: string, name: string, slug?: string) {
  const spec = RECORD_REGISTRY[targetType];
  touched.set(`${targetType}:${targetId}`, {
    targetType,
    targetId,
    name,
    path: slug ? spec.path(slug) : null,
  });
}

async function recordSlug(targetType: IngestTargetType, targetId: string): Promise<{ name: string; slug: string } | null> {
  const spec = RECORD_REGISTRY[targetType];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const record = await (db as any)[spec.prismaModel].findUnique({ where: { id: targetId } });
  if (!record) return null;
  return { name: record[spec.nameField], slug: record.slug ?? "" };
}

/** Resolve a by-name/by-id reference; records new creations in `touched`. */
async function resolveRef(
  targetType: IngestTargetType,
  id: string | undefined,
  name: string,
  user: SessionUser,
  touched: Touched,
  hint?: string,
): Promise<string> {
  if (id) {
    const found = await recordSlug(targetType, id);
    if (found) {
      touch(touched, targetType, id, found.name, found.slug);
      return id;
    }
  }
  const resolved = await resolveByType(targetType, name, user, hint);
  const found = await recordSlug(targetType, resolved.id);
  touch(touched, targetType, resolved.id, resolved.name, found?.slug);
  return resolved.id;
}

/**
 * `ideas` is the one field on a channel that is not a column: it arrives as a
 * list and becomes rows in the queue. Anything already queued under the same
 * title is left alone, so re-ingesting the same page of the slate does not
 * produce four copies of "doc series".
 */
export async function applyChannelIdeas(channelId: string, raw: unknown): Promise<void> {
  const titles = String(raw ?? "")
    .split(/[\n;•]+/)
    .map((t) => t.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((t) => t.length > 1 && t.length <= 300);
  if (!titles.length) return;

  const existing = await db.channelIdea.findMany({
    where: { channelId },
    select: { title: true, sortOrder: true },
  });
  const seen = new Set(existing.map((e) => e.title.toLowerCase()));
  let order = existing.reduce((n, e) => Math.max(n, e.sortOrder), 0);

  for (const title of titles) {
    if (seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    await db.channelIdea.create({ data: { channelId, title, sortOrder: ++order } });
  }
}

async function applyCreate(op: Extract<ProposedOp, { op: "create" }>, user: SessionUser, touched: Touched) {
  if (op.targetType === "entity") {
    const r = await resolveEntity(op.entityKind ?? "tag", op.name);
    touch(touched, "entity", r.id, r.name);
    return;
  }
  if (op.targetType === "event") {
    const start = op.fields?.startDate ? new Date(String(op.fields.startDate)) : null;
    if (!start || Number.isNaN(start.getTime())) throw new Error("Creating a sports event needs fields.startDate (YYYY-MM-DD).");
    const { slugify, uniqueSlug } = await import("@/lib/slug");
    const base = `${op.name} ${start.getFullYear()}`;
    const rows = await db.sportsEvent.findMany({ where: { slug: { startsWith: slugify(base) } }, select: { slug: true } });
    const event = await db.sportsEvent.create({
      data: {
        slug: uniqueSlug(base, new Set(rows.map((r) => r.slug))),
        title: op.name,
        league: op.fields?.league ? String(op.fields.league) : null,
        location: op.fields?.location ? String(op.fields.location) : null,
        notes: op.fields?.notes ? String(op.fields.notes) : null,
        startDate: start,
        endDate: op.fields?.endDate ? new Date(String(op.fields.endDate)) : null,
        approximate: true,
      },
    });
    await logAudit(user, { targetType: "event", targetId: event.id, targetLabel: event.title, action: "created", field: "ingest" });
    touch(touched, "event", event.id, event.title, event.slug);
    return;
  }

  const spec = RECORD_REGISTRY[op.targetType];
  const resolved = await resolveByType(op.targetType, op.name, user);
  // Apply create-time fields only where currently empty (never clobber)
  const record = await recordSlug(op.targetType, resolved.id);
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(op.fields ?? {})) {
    if (op.targetType === "channel" && key === "ideas") {
      await applyChannelIdeas(resolved.id, value);
      continue;
    }
    if (!spec.createFields.includes(key) && !spec.fields.some((f) => f.name === key)) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = (await (db as any)[spec.prismaModel].findUnique({ where: { id: resolved.id } }))?.[key];
    if (current == null || current === "") patch[key] = value;
  }
  if (Object.keys(patch).length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)[spec.prismaModel].update({ where: { id: resolved.id }, data: patch });
  }
  touch(touched, op.targetType, resolved.id, resolved.name, record?.slug);
}

/**
 * Versions this apply has itself moved past, by record. The optimistic check
 * exists to catch someone else editing a record while a proposal sat open; a
 * version bumped by the previous change in this same batch is not that. Without
 * this, an overview touching three fields on one page applied the first and
 * bounced the other two as "superseded" — by itself.
 */
type Versions = Map<string, number>;

async function applyUpdate(
  op: Extract<ProposedOp, { op: "update" }> & { expectedVersion?: number },
  effectiveValue: unknown,
  user: SessionUser,
  touched: Touched,
  versions: Versions,
): Promise<"applied" | "superseded"> {
  const spec = RECORD_REGISTRY[op.targetType];
  const targetId = await resolveRef(op.targetType, op.targetId, op.targetName, user, touched);
  const field = spec.fields.find((f) => f.name === op.field);
  if (!field) throw new Error(`Field ${op.field} is not ingest-editable.`);

  if (op.targetType === "channel" && op.field === "ideas") {
    await applyChannelIdeas(targetId, effectiveValue);
    await logAudit(user, {
      targetType: "channel", targetId,
      targetLabel: op.targetName, action: "updated",
      field: "ideas (ingest)", newValue: String(effectiveValue).slice(0, 300),
    });
    return "applied";
  }

  let value: unknown = effectiveValue;
  if (field.kind === "number" || field.kind === "year") value = Number(value);
  if (field.kind === "date") value = new Date(String(value));
  if (field.kind === "list" || field.kind === "vocablist") value = Array.isArray(value) ? value : splitList(String(value));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (db as any)[spec.prismaModel];
  const current = await model.findUnique({ where: { id: targetId } });
  if (!current) throw new Error("Record disappeared before apply.");

  const key = `${op.targetType}:${targetId}`;
  const expected = versions.get(key) ?? op.expectedVersion;
  if (spec.hasVersion && expected != null && current.version !== expected) {
    return "superseded";
  }

  await model.update({
    where: { id: targetId },
    data: {
      [op.field]: value,
      ...(spec.hasVersion ? { version: { increment: 1 } } : {}),
    },
  });
  if (spec.hasVersion) versions.set(key, current.version + 1);
  await logAudit(user, {
    targetType: op.targetType,
    targetId,
    targetLabel: current[spec.nameField],
    action: "updated",
    field: `${op.field} (ingest)`,
    oldValue: current[op.field] != null ? String(current[op.field]).slice(0, 300) : null,
    newValue: (Array.isArray(value) ? value.join(", ") : String(value)).slice(0, 300),
  });
  return "applied";
}

async function applyLink(op: Extract<ProposedOp, { op: "link" }>, user: SessionUser, touched: Touched) {
  const spec = LINK_SPECS[op.kind as keyof typeof LINK_SPECS];
  const aId = await resolveRef(spec.a.targetType, op.aId, op.aName, user, touched);
  const bId = await resolveRef(spec.b.targetType, op.bId, op.bName, user, touched, op.entityKind);

  const payload: Record<string, unknown> = { kind: op.kind, [spec.a.idField]: aId, [spec.b.idField]: bId };
  if (spec.roleField && op.role) payload[spec.roleField] = op.role;
  if (op.kind === "creator_entity" && !op.role) payload.relationship = "";

  const { linkPayloadSchema } = await import("@/lib/link-schema");
  const { auditInfo, refreshLinkSides, upsertLink } = await import("@/lib/link-core");
  const parsed = linkPayloadSchema.parse(payload) as LinkPayload;
  await upsertLink(parsed);
  const info = await auditInfo(parsed);
  await logAudit(user, { ...info, action: "linked", field: "ingest", newValue: info.other });
  await refreshLinkSides(parsed);
}

async function applyArchive(op: Extract<ProposedOp, { op: "archive" }>, user: SessionUser, touched: Touched, itemId: string) {
  const spec = RECORD_REGISTRY[op.targetType];
  const targetId = await resolveRef(op.targetType, op.targetId, op.targetName, user, touched);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (db as any)[spec.prismaModel];
  const current = await model.findUnique({ where: { id: targetId } });
  if (!current) throw new Error("Record not found.");
  await model.update({
    where: { id: targetId },
    data: { archived: true, archivedReason: op.reason, archivedAt: new Date() },
  });
  await logAudit(user, {
    targetType: op.targetType,
    targetId,
    targetLabel: current[spec.nameField],
    action: "archived",
    field: `ingest ${itemId}`,
    newValue: op.reason,
  });
}

/**
 * A record that must already exist — by id, or by exact name including the
 * Archive. Unlike resolveRef this never creates: renaming, restoring, moving
 * or unlinking something that isn't there is an error, not an invitation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findExisting(targetType: IngestTargetType, id: string | undefined, name: string): Promise<any> {
  const spec = RECORD_REGISTRY[targetType];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (db as any)[spec.prismaModel];
  if (id) {
    const byId = await model.findUnique({ where: { id } });
    if (byId) return byId;
  }
  const rows = await model.findMany({ where: { [spec.nameField]: { equals: name.trim(), mode: "insensitive" } }, take: 2 });
  // A live record wins over an archived namesake.
  const live = rows.find((r: { archived?: boolean }) => !r.archived);
  const found = live ?? rows[0];
  if (!found) throw new Error(`${spec.displayName} "${name}" is not on record.`);
  return found;
}

async function applyRename(op: Extract<ProposedOp, { op: "rename" }>, user: SessionUser, touched: Touched, versions: Versions) {
  const spec = RECORD_REGISTRY[op.targetType];
  const current = await findExisting(op.targetType, op.targetId, op.targetName);
  const oldName: string = current[spec.nameField];
  const data: Record<string, unknown> = { [spec.nameField]: op.newName };
  // The old name stays findable where the record keeps aliases.
  if (spec.fields.some((f) => f.name === "aliases") && oldName !== op.newName) {
    const aliases: string[] = Array.isArray(current.aliases) ? current.aliases : [];
    if (!aliases.some((a) => a.toLowerCase() === oldName.toLowerCase())) data.aliases = [...aliases, oldName];
  }
  if (spec.hasVersion) data.version = { increment: 1 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)[spec.prismaModel].update({ where: { id: current.id }, data });
  // The bump is this batch's own doing; later edits in it must not trip over it.
  if (spec.hasVersion) versions.set(`${op.targetType}:${current.id}`, current.version + 1);
  touch(touched, op.targetType, current.id, op.newName, current.slug);
  await logAudit(user, {
    targetType: op.targetType, targetId: current.id, targetLabel: op.newName,
    action: "updated", field: `${spec.nameField} (ingest)`, oldValue: oldName, newValue: op.newName,
  });
}

/** Returns the link payload it removed, so undo can put it back. */
async function applyUnlink(op: Extract<ProposedOp, { op: "unlink" }>, user: SessionUser, touched: Touched): Promise<LinkPayload> {
  const spec = LINK_SPECS[op.kind as keyof typeof LINK_SPECS];
  const a = await findExisting(spec.a.targetType, op.aId, op.aName);
  const b = await findExisting(spec.b.targetType, op.bId, op.bName);
  const payload: Record<string, unknown> = { kind: op.kind, [spec.a.idField]: a.id, [spec.b.idField]: b.id };
  if (spec.roleField && op.role) payload[spec.roleField] = op.role;
  if (op.kind === "creator_entity" && !op.role) payload.relationship = "";

  const { linkPayloadSchema } = await import("@/lib/link-schema");
  const { auditInfo, deleteLink, refreshLinkSides } = await import("@/lib/link-core");
  const parsed = linkPayloadSchema.parse(payload) as LinkPayload;
  await deleteLink(parsed);
  const info = await auditInfo(parsed);
  await logAudit(user, { ...info, action: "unlinked", field: "ingest", oldValue: info.other });
  await refreshLinkSides(parsed);
  const aSpec = RECORD_REGISTRY[spec.a.targetType];
  touch(touched, spec.a.targetType, a.id, a[aSpec.nameField], a.slug);
  return parsed;
}

const REVIVE: Record<string, string> = { format: "concept", project: "announced", opportunity: "researching", creator: "active", channel: "prospect" };

async function applyRestore(op: Extract<ProposedOp, { op: "restore" }>, user: SessionUser, touched: Touched, versions: Versions) {
  const spec = RECORD_REGISTRY[op.targetType];
  const current = await findExisting(op.targetType, op.targetId, op.targetName);
  if (!current.archived) return; // already live — nothing to do, and not an error
  const data: Record<string, unknown> = { archived: false, archivedReason: null, archivedAt: null };
  // "archived" was once a status too; a restored record needs a live one.
  if (current.status === "archived" && REVIVE[op.targetType]) data.status = REVIVE[op.targetType];
  if (spec.hasVersion) data.version = { increment: 1 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)[spec.prismaModel].update({ where: { id: current.id }, data });
  if (spec.hasVersion) versions.set(`${op.targetType}:${current.id}`, current.version + 1);
  touch(touched, op.targetType, current.id, current[spec.nameField], current.slug);
  await logAudit(user, {
    targetType: op.targetType, targetId: current.id, targetLabel: current[spec.nameField],
    action: "updated", field: "restored (ingest)", oldValue: current.archivedReason ?? null,
  });
}

async function applyConvert(op: Extract<ProposedOp, { op: "convert" }>, user: SessionUser, touched: Touched): Promise<ConvertOutcome> {
  const current = await findExisting(op.targetType, op.targetId, op.targetName);
  const outcome = await convertRecord(user, { type: op.targetType, id: current.id }, op.toType, {
    newName: op.newName,
    fields: op.fields,
  });
  // The old page is touched too: it is what the reviewer was looking at, and it now forwards.
  const fromSpec = RECORD_REGISTRY[op.targetType];
  touch(touched, op.targetType, current.id, current[fromSpec.nameField], current.slug);
  touch(touched, op.toType, outcome.toId, outcome.toName, outcome.toSlug);
  return outcome;
}

async function applyNote(op: Extract<ProposedOp, { op: "note" }>, user: SessionUser, touched: Touched) {
  if (!op.aboutType) return; // stays on the item only
  const spec = RECORD_REGISTRY[op.aboutType];
  if (!spec.notesField) return;
  const targetId = await resolveRef(op.aboutType, op.aboutId, op.aboutName ?? op.text.slice(0, 60), user, touched);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (db as any)[spec.prismaModel];
  const current = await model.findUnique({ where: { id: targetId } });
  if (!current) return;
  const stamp = new Date().toISOString().slice(0, 10);
  const appended = [current[spec.notesField], `[Ingest ${stamp}] ${op.text}`].filter(Boolean).join("\n\n");
  await model.update({ where: { id: targetId }, data: { [spec.notesField]: appended } });
  await logAudit(user, {
    targetType: op.aboutType,
    targetId,
    targetLabel: current[spec.nameField],
    action: "updated",
    field: `${spec.notesField} (ingest note)`,
    newValue: op.text.slice(0, 300),
  });
}

export async function applyIngestChangesCore(itemId: string, user: SessionUser): Promise<ApplyOutcome> {
  const item = await db.ingestItem.findUnique({ where: { id: itemId } });
  if (!item) throw new Error("Item not found.");

  const changes = await db.ingestChange.findMany({
    where: { itemId, status: { in: ["approved", "edited"] } },
    orderBy: { sortOrder: "asc" },
  });
  const ordered = [...changes].sort(
    (a, b) => (STAGE_ORDER[a.opType] ?? 9) - (STAGE_ORDER[b.opType] ?? 9) || a.sortOrder - b.sortOrder,
  );

  const touched: Touched = new Map();
  const versions: Versions = new Map();
  let applied = 0, failed = 0, superseded = 0;

  for (const change of ordered) {
    const op = change.payload as unknown as ProposedOp & { expectedVersion?: number };
    try {
      if (op.op === "create") {
        // A reviewer may have corrected the name or fields before approving.
        const edited =
          change.status === "edited" && change.editedAfter
            ? (change.editedAfter as { name?: string; fields?: Record<string, string> })
            : null;
        const effective = edited?.name
          ? { ...op, name: edited.name, fields: { ...(op.fields ?? {}), ...(edited.fields ?? {}) } }
          : op;
        // Remember which record a create actually produced, so the change can
        // be undone later without guessing by name.
        const before = new Set(touched.keys());
        await applyCreate(effective, user, touched);
        const created = [...touched.values()].find((t) => !before.has(`${t.targetType}:${t.targetId}`));
        if (created) {
          await db.ingestChange.update({
            where: { id: change.id },
            data: {
              destination: {
                ...(change.destination as object),
                createdTargetType: created.targetType,
                createdTargetId: created.targetId,
              },
            },
          });
        }
      }
      else if (op.op === "update") {
        const effective =
          change.status === "edited" && change.editedAfter != null
            ? (change.editedAfter as { value?: unknown }).value ?? change.editedAfter
            : op.value;
        const outcome = await applyUpdate(op, effective, user, touched, versions);
        if (outcome === "superseded") {
          // Refresh `before` from the live record and send it back to review.
          const spec = RECORD_REGISTRY[op.targetType];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fresh = op.targetId ? await (db as any)[spec.prismaModel].findUnique({ where: { id: op.targetId } }) : null;
          await db.ingestChange.update({
            where: { id: change.id },
            data: {
              status: "superseded",
              before: fresh ? (fresh[op.field] ?? null) : undefined,
              payload: { ...op, expectedVersion: fresh?.version ?? undefined } as object,
              error: "The record changed while this proposal was open — review against the new value.",
            },
          });
          superseded++;
          continue;
        }
      } else if (op.op === "link") await applyLink(op, user, touched);
      else if (op.op === "archive") await applyArchive(op, user, touched, itemId);
      else if (op.op === "note") await applyNote(op, user, touched);
      else if (op.op === "rename") await applyRename(op, user, touched, versions);
      else if (op.op === "restore") await applyRestore(op, user, touched, versions);
      else if (op.op === "unlink") {
        // Keep what was removed, so undo can put the connection back.
        const removed = await applyUnlink(op, user, touched);
        await db.ingestChange.update({ where: { id: change.id }, data: { before: removed as object } });
      } else if (op.op === "convert") {
        const moved = await applyConvert(op, user, touched);
        await db.ingestChange.update({
          where: { id: change.id },
          data: {
            destination: {
              ...(change.destination as object),
              movedToType: moved.toType,
              movedToId: moved.toId,
              movedToPath: moved.toPath,
            },
            after: {
              movedTo: moved.toType, name: moved.toName, path: moved.toPath,
              rehomed: moved.rehomed, label: labelFor(moved.toType) || moved.toType,
            },
          },
        });
      }

      await db.ingestChange.update({
        where: { id: change.id },
        data: { status: "applied", appliedAt: new Date(), appliedById: user.id, error: null },
      });
      applied++;
    } catch (e) {
      await db.ingestChange.update({
        where: { id: change.id },
        data: { status: "failed", error: e instanceof Error ? e.message : "Apply failed" },
      });
      failed++;
    }
  }

  // Source attribution on every touched record
  if (touched.size && applied > 0) {
    const title =
      item.kind === "email"
        ? `Email: ${(item.metadata as { subject?: string } | null)?.subject ?? item.filename ?? "message"}`
        : item.filename ?? "Pasted research";
    const source = await db.source.create({
      data: {
        title: `${title} (ingested)`,
        url: `/ingest/${item.id}`,
        sourceType: "ingest",
        addedById: user.id,
      },
    });
    for (const t of touched.values()) {
      if (t.targetType === "entity" || t.targetType === "event") continue;
      await db.recordSource.upsert({
        where: { sourceId_targetType_targetId: { sourceId: source.id, targetType: t.targetType, targetId: t.targetId } },
        update: {},
        create: { sourceId: source.id, targetType: t.targetType, targetId: t.targetId },
      });
    }
  }

  // Summary audit entry referencing the item
  await logAudit(user, {
    targetType: "ingest",
    targetId: itemId,
    targetLabel: item.filename ?? (item.metadata as { subject?: string } | null)?.subject ?? "Ingest item",
    action: "updated",
    field: "applied",
    newValue: `${applied} applied, ${superseded} superseded, ${failed} failed`,
  });

  // Final digest refresh for everything touched. The per-mutation hooks are
  // TTL-memoized, so an early refresh in this apply could otherwise mask the
  // record's final state — clear the memo and rebuild once, at the end.
  clearDigestMemo();
  for (const t of touched.values()) {
    await refreshDigest(t.targetType, t.targetId);
  }

  // Item status: done unless something needs another look
  const open = await db.ingestChange.count({
    where: { itemId, status: { in: ["pending", "approved", "edited", "superseded"] } },
  });
  await db.ingestItem.update({
    where: { id: itemId },
    data: { status: open > 0 ? "proposed" : "applied" },
  });

  return { applied, failed, superseded, touched: [...touched.values()] };
}
