"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveRecord } from "@/lib/actions/quick-edit";
import { useToast } from "@/components/toast";
import { QUIET_DAYS } from "@/lib/quiet-rules";

// The timer, shown on the page: how long since anything moved, how long
// until it archives itself, and the button that does it now.

export function QuietTimer({ targetType, id, name, quietDays, daysLeft, canEdit, onTimer }: {
  targetType: "format" | "project"; id: string; name: string; quietDays: number; daysLeft: number; canEdit: boolean; onTimer: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const archive = () => start(async () => {
    const r = await archiveRecord(targetType, id);
    if (!r.ok) return toast(r.error ?? "Couldn't archive that.", { tone: "error" });
    toast(`${name} moved to the Archive.`);
    router.push("/archive");
  });
  const urgent = onTimer && daysLeft <= 14;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-1.5 text-xs ${urgent ? "border-accent/40 bg-accent-wash text-accent-deep" : "border-line bg-wash/60 text-muted"}`}>
      {onTimer ? (
        <span>
          {quietDays === 0 ? "Updated today" : `Quiet for ${quietDays} day${quietDays === 1 ? "" : "s"}`}
          {" · "}
          {daysLeft === 0 ? "archives on the next sweep" : `archives itself in ${daysLeft} day${daysLeft === 1 ? "" : "s"} unless it moves`}
        </span>
      ) : (
        <span>{quietDays === 0 ? "Updated today" : `Last moved ${quietDays} day${quietDays === 1 ? "" : "s"} ago`}</span>
      )}
      {canEdit && (
        <button type="button" className="font-medium underline decoration-dotted underline-offset-2 hover:text-accent" disabled={pending} onClick={archive} title={`Move ${name} to the Archive now — it keeps everything and can come back any time`}>
          {pending ? "Moving…" : "Move to Archive now"}
        </button>
      )}
      {onTimer && !urgent && <span className="text-faint">Early-stage formats and projects archive after {QUIET_DAYS} days without an update.</span>}
    </div>
  );
}
