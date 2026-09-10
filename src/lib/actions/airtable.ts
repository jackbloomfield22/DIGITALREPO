"use server";

// Buttons that talk to the Airtable mirror: one on each format and project
// page, the rest on Admin → Airtable.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { saveAirtableConfig, airtableConfig } from "@/lib/airtable/config";
import { checkConnection, drainAirtableQueue, forgetAirtableTables, isMirrored, queueAirtableSync, queueEverything, setupTables, syncRecord, airtableStateFor, type AirtableState, type ConnectionReport, type DrainSummary, type SetupReport } from "@/lib/airtable/sync";
import { db } from "@/lib/db";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Push this record now, files included, whether or not anything changed. */
export async function syncRecordNow(targetType: string, targetId: string): Promise<Result<{ state: AirtableState }>> {
  try {
    await requireRole("EDITOR");
    if (!isMirrored(targetType)) return { ok: false, error: "Only formats and projects go to Airtable." };
    await db.airtableJob.deleteMany({ where: { targetType, targetId } }).catch(() => {});
    await syncRecord(targetType, targetId, { reason: "forced" });
    revalidatePath("/", "layout");
    return { ok: true, state: await airtableStateFor(targetType, targetId) };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not sync to Airtable.";
    await db.airtableSync.updateMany({ where: { targetType, targetId }, data: { error: message.slice(0, 1000), errorAt: new Date() } }).catch(() => {});
    return { ok: false, error: message };
  }
}

export async function saveAirtableSettings(input: { baseId: string; formatsTable: string; projectsTable: string; formatsOn: boolean; projectsOn: boolean }): Promise<Result> {
  try {
    await requireRole("ADMIN");
    const baseId = input.baseId.trim();
    if (baseId && !/^app[A-Za-z0-9]{10,20}$/.test(baseId)) return { ok: false, error: "A base id starts with \"app\" followed by letters and numbers — copy it from the base's URL." };
    await saveAirtableConfig({
      baseId,
      tables: { format: input.formatsTable.trim() || "Formats", project: input.projectsTable.trim() || "Projects" },
      enabled: { format: input.formatsOn, project: input.projectsOn },
    });
    forgetAirtableTables();
    revalidatePath("/admin/airtable");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save." };
  }
}

export async function checkAirtable(): Promise<Result<{ report: ConnectionReport }>> {
  try {
    await requireRole("ADMIN");
    forgetAirtableTables();
    const report = await checkConnection();
    // Remember what the table calls its primary field, so rows use that name.
    const primaryField: Record<string, string> = {};
    for (const t of report.tables) if (t.found && t.primaryField) primaryField[t.type] = t.primaryField;
    if (Object.keys(primaryField).length) await saveAirtableConfig({ primaryField });
    return { ok: true, report };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Check failed." };
  }
}

export async function setupAirtable(): Promise<Result<{ report: SetupReport }>> {
  try {
    await requireRole("ADMIN");
    const report = await setupTables();
    revalidatePath("/admin/airtable");
    return { ok: true, report };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Set-up failed." };
  }
}

/** Queue every record (first call) and work through a batch. The page calls this again while `remaining` is above zero. */
export async function syncEverything(input: { first: boolean }): Promise<Result<{ queued: number; summary: DrainSummary }>> {
  try {
    await requireRole("ADMIN");
    const queued = input.first ? await queueEverything() : 0;
    const summary = await drainAirtableQueue({ limit: 30 });
    revalidatePath("/admin/airtable");
    return { ok: true, queued, summary };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sync failed." };
  }
}

/** Retry the jobs that gave up, after the cause (a token, a field) has been fixed. */
export async function retryFailedAirtableJobs(): Promise<Result<{ reset: number }>> {
  try {
    await requireRole("ADMIN");
    const r = await db.airtableJob.updateMany({ where: { attempts: { gt: 0 } }, data: { attempts: 0, lastError: null, claimedAt: null } });
    revalidatePath("/admin/airtable");
    return { ok: true, reset: r.count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reset." };
  }
}

export async function currentAirtableConfig() {
  await requireRole("ADMIN");
  return airtableConfig();
}

export async function queueAirtableFor(targetType: string, targetId: string): Promise<void> {
  await requireRole("EDITOR");
  await queueAirtableSync(targetType, targetId);
}
