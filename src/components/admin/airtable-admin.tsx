"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkAirtable, retryFailedAirtableJobs, saveAirtableSettings, setupAirtable, syncEverything } from "@/lib/actions/airtable";
import { useToast } from "@/components/toast";
import type { ConnectionReport } from "@/lib/airtable/sync";

// Admin → Airtable: point the mirror at a base, check it, set up the tables,
// and push everything. Runs one batch at a time so a big first sync shows
// progress rather than sitting on a spinner.

export function AirtableSettingsForm({ initial }: { initial: { baseId: string; formatsTable: string; projectsTable: string; formatsOn: boolean; projectsOn: boolean; baseFromEnv: boolean } }) {
  const [form, setForm] = useState(initial);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const save = () => start(async () => {
    const r = await saveAirtableSettings(form);
    if (!r.ok) return toast(r.error, { tone: "error" });
    toast("Saved.");
    router.refresh();
  });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-muted">Base id</span>
        <input type="text" value={form.baseId} onChange={(e) => setForm({ ...form, baseId: e.target.value })} placeholder={initial.baseFromEnv ? "Using AIRTABLE_BASE_ID from Vercel" : "appXXXXXXXXXXXXXX"} />
        <span className="mt-1 block text-xs text-faint">From the base&rsquo;s URL: airtable.com/<b>appXXXXXXXXXXXXXX</b>/… {initial.baseFromEnv && "Leave blank to keep using the one set in Vercel."}</span>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-muted">Table for formats</span>
        <input type="text" value={form.formatsTable} onChange={(e) => setForm({ ...form, formatsTable: e.target.value })} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-muted">Table for projects</span>
        <input type="text" value={form.projectsTable} onChange={(e) => setForm({ ...form, projectsTable: e.target.value })} />
      </label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-current" checked={form.formatsOn} onChange={(e) => setForm({ ...form, formatsOn: e.target.checked })} /> Mirror formats</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-current" checked={form.projectsOn} onChange={(e) => setForm({ ...form, projectsOn: e.target.checked })} /> Mirror projects</label>
      <div className="sm:col-span-2"><button className="btn btn-primary btn-sm" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save settings"}</button></div>
    </div>
  );
}

export function AirtableControls({ tokenPresent, queued, failed }: { tokenPresent: boolean; queued: number; failed: number }) {
  const [report, setReport] = useState<ConnectionReport | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [running, setRunning] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const check = () => start(async () => {
    const r = await checkAirtable();
    if (!r.ok) return toast(r.error, { tone: "error" });
    setReport(r.report);
    router.refresh();
  });
  const setup = () => start(async () => {
    const r = await setupAirtable();
    if (!r.ok) return toast(r.error, { tone: "error" });
    if (r.report.problem) toast(r.report.problem, { tone: "error" });
    else toast(r.report.created.length ? `Created ${r.report.created.join("; ")}.` : "Everything was already in place.");
    const again = await checkAirtable();
    if (again.ok) setReport(again.report);
    router.refresh();
  });
  const syncAll = async () => {
    setRunning(true);
    setLog([]);
    let first = true;
    let total = 0;
    try {
      for (let round = 0; round < 200; round++) {
        const r = await syncEverything({ first });
        if (!r.ok) { setLog((l) => [...l, `Stopped: ${r.error}`]); break; }
        if (first) setLog((l) => [...l, `${r.queued} records queued.`]);
        first = false;
        total += r.summary.synced;
        setLog((l) => [...l, `Pushed ${r.summary.synced}, unchanged ${r.summary.skipped}, failed ${r.summary.failed}; ${r.summary.remaining} left.`, ...r.summary.errors.slice(0, 3).map((e) => `  ${e.targetType} ${e.targetId}: ${e.error}`)]);
        if (r.summary.remaining === 0 || (r.summary.synced + r.summary.skipped + r.summary.failed) === 0) break;
      }
      setLog((l) => [...l, `Done. ${total} records pushed to Airtable.`]);
    } finally {
      setRunning(false);
      router.refresh();
    }
  };
  const retry = () => start(async () => {
    const r = await retryFailedAirtableJobs();
    if (!r.ok) return toast(r.error, { tone: "error" });
    toast(`${r.reset} job${r.reset === 1 ? "" : "s"} will be tried again.`);
    router.refresh();
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-secondary btn-sm" disabled={pending || !tokenPresent} onClick={check}>Check connection</button>
        <button className="btn btn-secondary btn-sm" disabled={pending || !tokenPresent} onClick={setup} title="Creates the tables and fields the mirror needs, where they are missing">Set up tables & fields</button>
        <button className="btn btn-primary btn-sm" disabled={running || pending || !tokenPresent} onClick={syncAll}>{running ? "Syncing…" : "Sync everything now"}</button>
        {failed > 0 && <button className="btn btn-ghost btn-sm" disabled={pending} onClick={retry}>Retry {failed} failed</button>}
      </div>
      {queued > 0 && <p className="text-xs text-muted">{queued} record{queued === 1 ? "" : "s"} waiting to be pushed. They go on the next sync, and the nightly pass catches anything left.</p>}
      {report && (
        <div className="rounded-md border border-line bg-wash/60 p-3 text-sm">
          {report.problem ? (
            <p className="text-accent-deep">{report.problem}</p>
          ) : (
            <ul className="space-y-1">
              {report.tables.map((t) => (
                <li key={t.type}>
                  <span className="font-medium">{t.type === "format" ? "Formats" : "Projects"}</span> → table &ldquo;{t.wanted}&rdquo;:{" "}
                  {!t.found ? <span className="text-accent-deep">not found (Set up will create it)</span>
                    : t.missingFields.length ? <span className="text-accent-deep">missing {t.missingFields.join(", ")} (Set up will add them)</span>
                    : <span className="text-ok">ready</span>}
                  {t.found && t.primaryField && t.primaryField !== "Name" && <span className="text-faint"> · titles go in its &ldquo;{t.primaryField}&rdquo; column</span>}
                </li>
              ))}
              {report.ok && <li className="text-ok">Connected. New and edited formats and projects will appear in Airtable within seconds; press &ldquo;Sync everything now&rdquo; once to fill it with what is already here.</li>}
            </ul>
          )}
        </div>
      )}
      {log.length > 0 && (
        <pre className="max-h-64 overflow-auto rounded-md border border-line bg-wash/60 p-3 text-xs">{log.join("\n")}</pre>
      )}
    </div>
  );
}
