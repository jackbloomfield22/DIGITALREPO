"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createSnapshot } from "@/lib/backup";

export async function createBackupNow(): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireRole("ADMIN");
    const snapshot = await createSnapshot("manual", `by ${user.name}`);
    await logAudit(user, {
      targetType: "snapshot",
      targetId: snapshot.id,
      targetLabel: "Full database backup",
      action: "created",
    });
    revalidatePath("/admin/backups");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Backup failed." };
  }
}

export async function deleteSnapshot(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireRole("ADMIN");
    await db.snapshot.delete({ where: { id } });
    await logAudit(user, {
      targetType: "snapshot",
      targetId: id,
      targetLabel: "Database backup",
      action: "archived",
    });
    revalidatePath("/admin/backups");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed." };
  }
}
