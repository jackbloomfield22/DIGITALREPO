"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { closeReview, movePipeline, rescheduleTask, setTaskStatus } from "@/lib/actions/hq";

export function StalledCardActions({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (stage: string) => start(async () => { await movePipeline(id, stage); router.refresh(); });
  return (
    <span className="flex items-center gap-1 text-xs">
      <Link href={`/hq/pipeline/${id}`} className="btn btn-secondary btn-sm" title={`Open ${title} and write the next step`}>Push</Link>
      <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => act("parked")}>Park</button>
      <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => act("passed")}>Drop</button>
    </span>
  );
}

export function OverdueTaskActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <span className="flex items-center gap-1 text-xs">
      <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { await setTaskStatus(id, "done"); router.refresh(); })}>Done</button>
      <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { await rescheduleTask(id, 7); router.refresh(); })}>+7d</button>
      <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { await setTaskStatus(id, "dropped"); router.refresh(); })}>Drop</button>
    </span>
  );
}

export function CloseReview() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  return (
    <div className="card p-4">
      <div className="overline mb-1">Close the week</div>
      <p className="mb-2 text-xs text-muted">Three lines: what moved, what didn&rsquo;t and why, what one thing next week must do. This and the journal above become a review note in the Brain.</p>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} className="w-full text-sm" placeholder="What moved… What stalled… Next week…" />
      <div className="mt-2 flex justify-end">
        <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => start(async () => { const r = await closeReview(text); if (r.ok) router.push(`/hq/brain/${r.noteId}`); })}>{pending ? "Closing…" : "Close the review"}</button>
      </div>
    </div>
  );
}
