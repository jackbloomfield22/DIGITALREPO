"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteTask, saveTask, setTaskStatus } from "@/lib/actions/hq";

export type TaskRow = {
  id: string; title: string; kind: string; status: string; priority: number; dueAt: string | null; notes: string | null; waitingSince?: string | null; nudgeAfterDays?: number | null;
  relationship?: { id: string; name: string } | null; pipeline?: { id: string; title: string } | null;
};

function dueLabel(iso: string | null): { text: string; tone: string } {
  if (!iso) return { text: "", tone: "text-faint" };
  const d = new Date(iso); const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return { text: `${-diff}d overdue`, tone: "text-[#8a3a30] font-medium" };
  if (diff === 0) return { text: "today", tone: "text-accent-deep font-medium" };
  if (diff === 1) return { text: "tomorrow", tone: "text-charcoal" };
  if (diff < 7) return { text: d.toLocaleDateString(undefined, { weekday: "short" }), tone: "text-muted" };
  return { text: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), tone: "text-muted" };
}

export function TaskList({ tasks, emptyText = "Nothing here.", allowAdd, defaults }: { tasks: TaskRow[]; emptyText?: string; allowAdd?: boolean; defaults?: { relationshipId?: string; pipelineId?: string; kind?: "task" | "follow_up" } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = (t: TaskRow) => {
    setBusy(t.id);
    start(async () => { await setTaskStatus(t.id, t.status === "done" ? "open" : "done"); setBusy(null); router.refresh(); });
  };
  const add = () => {
    const title = adding.trim(); if (!title) return;
    start(async () => { await saveTask({ title, ...defaults }); setAdding(""); router.refresh(); });
  };

  return (
    <div>
      {tasks.length === 0 && <div className="text-sm text-faint">{emptyText}</div>}
      <ul className="divide-y divide-line">
        {tasks.map((t) => {
          const due = dueLabel(t.dueAt);
          const waitingDays = t.status === "waiting" && t.waitingSince ? Math.floor((new Date().getTime() - new Date(t.waitingSince).getTime()) / 86_400_000) : null;
          const nudge = waitingDays !== null && waitingDays >= (t.nudgeAfterDays ?? 5);
          return (
            <li key={t.id} className={`flex items-start gap-2.5 py-2 ${t.status === "done" ? "opacity-50" : ""}`}>
              <input type="checkbox" className="mt-1 !w-auto" checked={t.status === "done"} disabled={busy === t.id} onChange={() => toggle(t)} aria-label={`Done: ${t.title}`} />
              <div className="min-w-0 flex-1">
                <div className={`text-sm ${t.status === "done" ? "line-through" : ""}`}>
                  {t.priority === 1 && <span className="mr-1 text-accent-deep" title="High priority">!</span>}
                  {t.title}
                </div>
                <div className="flex flex-wrap gap-x-2 text-xs text-faint">
                  {t.status === "waiting" && <span className={nudge ? "font-medium text-[#8a3a30]" : "text-warn"}>⏳ waiting {waitingDays}d{nudge ? " — nudge" : ""}</span>}
                  {t.kind === "follow_up" && t.status !== "waiting" && <span className="text-muted">follow-up</span>}
                  {t.relationship && <Link href={`/hq/people/${t.relationship.id}`} className="hover:text-accent">{t.relationship.name}</Link>}
                  {t.pipeline && <Link href={`/hq/pipeline/${t.pipeline.id}`} className="hover:text-accent">#{t.pipeline.title}</Link>}
                  {t.notes && <span className="truncate">{t.notes.slice(0, 80)}</span>}
                </div>
              </div>
              {due.text && t.status !== "waiting" && <span className={`shrink-0 text-xs ${due.tone}`}>{due.text}</span>}
              {t.status !== "done" && (
                <button className="shrink-0 text-xs text-faint hover:text-accent" title={t.status === "waiting" ? "Ball is back in your court" : "Waiting on them"} onClick={() => start(async () => { await setTaskStatus(t.id, t.status === "waiting" ? "open" : "waiting"); router.refresh(); })}>{t.status === "waiting" ? "↩" : "⏳"}</button>
              )}
              <button className="shrink-0 text-xs text-faint hover:text-[#8a3a30]" title="Delete" onClick={() => start(async () => { await deleteTask(t.id); router.refresh(); })}>×</button>
            </li>
          );
        })}
      </ul>
      {allowAdd && (
        <div className="mt-2 flex gap-2">
          <input value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={defaults?.kind === "follow_up" ? "Add a follow-up…" : "Add a task…"} className="flex-1 text-sm" />
          <button className="btn btn-secondary btn-sm" disabled={!adding.trim() || pending} onClick={add}>Add</button>
        </div>
      )}
    </div>
  );
}
