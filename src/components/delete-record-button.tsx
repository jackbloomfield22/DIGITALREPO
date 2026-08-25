"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteRecord } from "@/lib/actions/delete-record";
import { useToast } from "@/components/toast";

export function DeleteRecordButton({ targetType, id, label }: {
  targetType: string;
  id: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const doDelete = async () => {
    setBusy(true);
    const res = await deleteRecord({ targetType, id });
    setBusy(false);
    if (res.ok) {
      toast(`Deleted ${label}`);
      setOpen(false);
      router.push(res.redirect);
      router.refresh();
    } else {
      toast(res.error, { tone: "error" });
    }
  };

  return (
    <>
      <button
        className="btn btn-secondary btn-sm text-muted hover:border-accent hover:text-accent"
        onClick={() => setOpen(true)}
      >
        Delete
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" aria-hidden onClick={() => !busy && setOpen(false)} />
          <div role="alertdialog" aria-modal="true" className="relative w-full max-w-sm rounded-md border border-line bg-surface p-5 shadow-pop">
            <p className="font-semibold">Are you sure you want to delete this?</p>
            <p className="mt-1.5 text-sm text-muted">
              <span className="font-medium text-ink">{label}</span> and everything linking to it
              will be permanently removed. Unlike Archive, this can only be undone by restoring
              a backup.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-accent btn-sm" disabled={busy} onClick={doDelete}>
                {busy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
