"use server";

// Changing a record's status, or putting it in the Archive, from wherever you
// happen to be looking at it — a directory row, the development slate, a
// profile header. Opening the full edit form to move one project from
// "developing" to "on hold" was the long way round for the most common edit
// there is.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { refreshDigest } from "@/lib/ingest/digest";
import {
  CHANNEL_STATUSES,
  CREATOR_STATUSES,
  FORMAT_STATUSES,
  OPPORTUNITY_STATUSES,
  PROJECT_STATUSES,
  labelFor,
} from "@/lib/taxonomy";
import type { ArchiveType, StatusType } from "@/lib/row-status";

export type QuickResult = { ok: boolean; error?: string };

/**
 * The record types that carry a status and an archive flag. `revive` is the
 * status a record comes back to when it is restored from the Archive and its
 * stored status still says "archived" — otherwise it would return invisible.
 */
const SPEC = {
  project: { model: "project", nameField: "title", path: "/projects", statuses: PROJECT_STATUSES, revive: "announced", label: "Project", dated: true },
  format: { model: "format", nameField: "title", path: "/formats", statuses: FORMAT_STATUSES, revive: "concept", label: "Format", dated: true },
  opportunity: { model: "opportunity", nameField: "title", path: "/opportunities", statuses: OPPORTUNITY_STATUSES, revive: "researching", label: "Opportunity", dated: true },
  creator: { model: "creator", nameField: "name", path: "/talent", statuses: CREATOR_STATUSES, revive: "active", label: "Talent", dated: false },
  channel: { model: "channel", nameField: "name", path: "/youtube", statuses: CHANNEL_STATUSES, revive: "prospect", label: "YouTube Channel", dated: true },
} as const;

/** Types that can be archived but have no status of their own. */
const ARCHIVE_ONLY = {
  organization: { model: "organization", nameField: "name", path: "/organizations", label: "Organization" },
  person: { model: "industryPerson", nameField: "name", path: "/people", label: "Industry Person" },
} as const;


const archiveSpec = (type: ArchiveType) =>
  (type in SPEC ? SPEC[type as StatusType] : ARCHIVE_ONLY[type as keyof typeof ARCHIVE_ONLY]) as {
    model: string; nameField: "name" | "title"; path: string; label: string;
  };

export async function setRecordStatus(type: StatusType, id: string, status: string): Promise<QuickResult> {
  try {
    const user = await requireRole("EDITOR");
    const spec = SPEC[type];
    if (!spec) return { ok: false, error: "Unknown record type." };
    if (!spec.statuses.some((s) => s.value === status)) {
      return { ok: false, error: `"${status}" isn't a status a ${spec.label.toLowerCase()} can have.` };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (db as any)[spec.model];
    const before = await model.findUnique({ where: { id } });
    if (!before) return { ok: false, error: "That record is no longer here." };
    if (before.status === status) return { ok: true };

    await model.update({
      where: { id },
      data: { status, ...(spec.dated ? { lastActivityAt: new Date() } : {}), version: { increment: 1 } },
    });
    await logAudit(user, {
      targetType: type,
      targetId: id,
      targetLabel: before[spec.nameField],
      action: "updated",
      field: "status",
      oldValue: labelFor(before.status),
      newValue: labelFor(status),
    });
    await refreshDigest(type, id);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not change that status." };
  }
}

export async function archiveRecord(type: ArchiveType, id: string, reason?: string): Promise<QuickResult> {
  try {
    const user = await requireRole("EDITOR");
    const spec = archiveSpec(type);
    if (!spec) return { ok: false, error: "Unknown record type." };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (db as any)[spec.model];
    const before = await model.findUnique({ where: { id } });
    if (!before) return { ok: false, error: "That record is no longer here." };

    await model.update({
      where: { id },
      data: {
        archived: true,
        archivedReason: reason?.trim()?.slice(0, 500) || "Moved to the Archive",
        archivedAt: new Date(),
      },
    });
    await logAudit(user, {
      targetType: type,
      targetId: id,
      targetLabel: before[spec.nameField],
      action: "archived",
      newValue: reason?.trim()?.slice(0, 300) ?? null,
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not archive that." };
  }
}

/**
 * Bring a record back out of the Archive. A record whose stored status still
 * reads "archived" (the development slate's archive arrived that way) gets a
 * live status again, so restoring actually puts it back where you can see it.
 */
export async function restoreRecord(type: ArchiveType, id: string, status?: string): Promise<QuickResult> {
  try {
    const user = await requireRole("EDITOR");
    const spec = archiveSpec(type);
    if (!spec) return { ok: false, error: "Unknown record type." };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (db as any)[spec.model];
    const before = await model.findUnique({ where: { id } });
    if (!before) return { ok: false, error: "That record is no longer here." };

    const statusSpec = type in SPEC ? SPEC[type as StatusType] : null;
    const wanted = status && statusSpec?.statuses.some((s) => s.value === status) ? status : null;
    const nextStatus =
      statusSpec && (wanted ?? (before.status === "archived" ? statusSpec.revive : null));

    await model.update({
      where: { id },
      data: {
        archived: false,
        archivedReason: null,
        archivedAt: null,
        ...(nextStatus ? { status: nextStatus, ...(statusSpec!.dated ? { lastActivityAt: new Date() } : {}) } : {}),
      },
    });
    await logAudit(user, {
      targetType: type,
      targetId: id,
      targetLabel: before[spec.nameField],
      action: "restored",
      newValue: nextStatus ? labelFor(nextStatus) : null,
    });
    await refreshDigest(type, id);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not restore that." };
  }
}
