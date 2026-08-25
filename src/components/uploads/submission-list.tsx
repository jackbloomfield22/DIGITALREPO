"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeIngestItem, retryIngestItem, revertIngestChanges } from "@/lib/actions/ingest";
import { revertImportChunk } from "@/lib/actions/bulk-upload";
import { useToast } from "@/components/toast";
import type { Submission } from "@/lib/uploads";

const STATE_STYLE: Record<Submission["state"], string> = {
  "needs-review": "bg-accent-wash text-accent-deep",
  "in-repo": "bg-wash text-muted",
  working: "bg-wash text-muted",
  "nothing-found": "bg-wash text-faint",
  problem: "bg-wash text-warn",
};

function when(iso: string) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} hr ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SubmissionList({ submissions, canEdit }: { submissions: Submission[]; canEdit: boolean }) {
  const [confirming, setConfirming] = useState<Submission | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  async function remove(s: Submission) {
    setConfirming(null);
    setBusyId(s.id);
    try {
      if (s.kind === "bundle") {
        let removed = 0;
        let first = true;
        for (;;) {
          const res = await revertImportChunk({ sourceId: s.id, first });
          first = false;
          if (!res.ok) {
            toast(res.error, { tone: "error" });
            return;
          }
          removed += res.deleted;
          setProgress(`Removing… ${removed}`);
          if (res.done) break;
        }
        toast(`Removed ${removed} records`);
      } else {
        const res = await removeIngestItem(s.id);
        if (!res.ok) {
          toast(res.error ?? "Could not remove that.", { tone: "error" });
          return;
        }
        const undone = (res.reverted ?? 0) + (res.deleted ?? 0);
        toast(undone ? `Removed — ${undone} changes put back` : "Removed");
        if (res.skipped?.length) {
          toast(`${res.skipped.length} changes needed a manual check`, { tone: "error" });
        }
      }
      router.refresh();
    } finally {
      setBusyId(null);
      setProgress(null);
    }
  }

  async function undo(s: Submission) {
    setBusyId(s.id);
    const res = await revertIngestChanges(s.id);
    setBusyId(null);
    if (!res.ok) {
      toast(res.error ?? "Undo failed.", { tone: "error" });
      return;
    }
    toast(`Put back ${(res.reverted ?? 0) + (res.deleted ?? 0)} changes — you can review it again`);
    router.refresh();
  }

  async function retry(s: Submission) {
    setBusyId(s.id);
    const res = await retryIngestItem(s.id);
    setBusyId(null);
    if (!res.ok) {
      toast(res.error ?? "Retry failed.", { tone: "error" });
      return;
    }
    toast("Cleared — run it again from the Ingest queue");
    router.refresh();
  }

  if (!submissions.length) {
    return (
      <div className="rounded-md border border-dashed border-line-strong bg-wash/50 px-6 py-10 text-center text-sm text-muted">
        Nothing submitted yet. Anything you add above shows up here, and can be taken back out.
      </div>
    );
  }

  return (
    <>
      <div className="card divide-y divide-line">
        {submissions.map((s) => (
          <div key={`${s.kind}:${s.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${STATE_STYLE[s.state]}`}>
                  {s.stateLabel}
                </span>
                {s.href ? (
                  <Link href={s.href} className="truncate font-medium hover:text-accent">
                    {s.title}
                  </Link>
                ) : (
                  <span className="truncate font-medium">{s.title}</span>
                )}
              </div>
              <div className="truncate text-xs text-muted">
                {when(s.createdAt)} · {s.detail}
              </div>
            </div>
            {canEdit && (
              <div className="flex shrink-0 gap-1.5">
                {busyId === s.id ? (
                  <span className="text-xs text-muted">{progress ?? "Working…"}</span>
                ) : (
                  <>
                    {s.canUndo && s.kind === "ingest" && (
                      <button className="btn btn-ghost btn-sm" disabled={!!busyId} onClick={() => undo(s)}>
                        Undo
                      </button>
                    )}
                    {s.canRetry && (
                      <button className="btn btn-ghost btn-sm" disabled={!!busyId} onClick={() => retry(s)}>
                        Retry
                      </button>
                    )}
                    <button
                      className="btn btn-secondary btn-sm text-muted hover:border-accent hover:text-accent"
                      disabled={!!busyId}
                      onClick={() => setConfirming(s)}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" aria-hidden onClick={() => setConfirming(null)} />
          <div role="alertdialog" aria-modal="true" className="relative w-full max-w-sm rounded-md border border-line bg-surface p-5 shadow-pop">
            <p className="font-semibold">Are you sure you want to delete this?</p>
            <p className="mt-1.5 text-sm text-muted">
              <span className="font-medium text-ink">{confirming.title}</span> will be removed
              {confirming.state === "in-repo"
                ? ", and everything it put into the Repo will be taken back out."
                : "."}{" "}
              You can submit the same material again afterwards.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirming(null)}>
                Cancel
              </button>
              <button className="btn btn-accent btn-sm" onClick={() => remove(confirming)}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
