"use client";

import { useState, useTransition } from "react";
import { syncRecordNow } from "@/lib/actions/airtable";
import { useToast } from "@/components/toast";
import { relativeTime } from "@/lib/format";

// One line on a format or project page: where its Airtable row is, when it
// was last pushed, and a button to push it now.

export type AirtableCardState = {
  configured: boolean; enabled: boolean; recordUrl: string | null; syncedAt: string | null; error: string | null; queued: boolean;
};

export function AirtableCard({ targetType, targetId, state: initial, canEdit }: { targetType: "format" | "project"; targetId: string; state: AirtableCardState; canEdit: boolean }) {
  const [state, setState] = useState(initial);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  if (!state.configured || !state.enabled) return null;

  const push = () => start(async () => {
    const r = await syncRecordNow(targetType, targetId);
    if (!r.ok) { toast(r.error, { tone: "error" }); setState((s) => ({ ...s, error: r.error })); return; }
    setState({ ...r.state, syncedAt: r.state.syncedAt ? new Date(r.state.syncedAt).toISOString() : null });
    toast("Airtable is up to date.");
  });

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-wash/60 px-3 py-1.5 text-xs text-muted">
      <span className="font-medium text-ink">Airtable</span>
      {state.recordUrl ? (
        <a href={state.recordUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-accent">Open row ↗</a>
      ) : (
        <span>{state.queued ? "Row on its way" : "No row yet"}</span>
      )}
      {state.syncedAt && <span>synced {relativeTime(state.syncedAt)}</span>}
      {state.queued && state.syncedAt && <span>· update pending</span>}
      {state.error && <span className="text-accent-deep" title={state.error}>· last push failed</span>}
      {canEdit && (
        <button type="button" className="font-medium underline decoration-dotted underline-offset-2 hover:text-accent" disabled={pending} onClick={push} title="Push this page and its files to Airtable now">
          {pending ? "Syncing…" : state.recordUrl ? "Sync now" : "Add to Airtable"}
        </button>
      )}
    </div>
  );
}
