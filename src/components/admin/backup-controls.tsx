"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBackupNow, deleteSnapshot } from "@/lib/actions/backup";
import { useToast } from "@/components/toast";

export function BackupControls() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  return (
    <button
      className="btn btn-primary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await createBackupNow();
        toast(res.ok ? "Backup created" : (res.error ?? "Backup failed"), res.ok ? {} : { tone: "error" });
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? "Backing up…" : "Back Up Now"}
    </button>
  );
}

export function DeleteSnapshotButton({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <button
      className="btn btn-ghost btn-sm text-accent"
      aria-label="Delete backup"
      onClick={async () => {
        if (!window.confirm("Delete this backup? Downloaded copies are unaffected.")) return;
        const res = await deleteSnapshot(id);
        toast(res.ok ? "Backup deleted" : (res.error ?? "Failed"), res.ok ? {} : { tone: "error" });
        router.refresh();
      }}
    >
      Delete
    </button>
  );
}
