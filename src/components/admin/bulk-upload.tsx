"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  discardBulkUpload,
  finishBulkUpload,
  runBulkUploadStep,
  stageBundle,
} from "@/lib/actions/bulk-upload";
import { IMPORT_PHASES, PHASE_LABELS, type ImportPhase } from "@/lib/drive-import";
import { useToast } from "@/components/toast";

type Staged = {
  key: string;
  sourceTitle: string;
  fileName: string;
  totals: Record<ImportPhase, number>;
  grandTotal: number;
};

type Progress = {
  phase: ImportPhase;
  done: number;
  overall: number;
  created: number;
  enriched: number;
};

export function BulkUpload() {
  const [json, setJson] = useState("");
  const [fileName, setFileName] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [staged, setStaged] = useState<Staged | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ created: number; enriched: number } | null>(null);
  const cancelled = useRef(false);
  const router = useRouter();
  const { toast } = useToast();

  async function onStage() {
    setBusy(true);
    const res = await stageBundle({ json, title, url });
    setBusy(false);
    if (!res.ok) {
      toast(res.error, { tone: "error" });
      return;
    }
    setStaged({
      key: res.key,
      sourceTitle: res.sourceTitle,
      fileName,
      totals: res.totals,
      grandTotal: res.grandTotal,
    });
  }

  async function onRun() {
    if (!staged) return;
    cancelled.current = false;
    setBusy(true);

    let phase: ImportPhase | null =
      IMPORT_PHASES.find((p) => staged.totals[p] > 0) ?? null;
    let offset = 0;
    let created = 0;
    let enriched = 0;
    let overall = 0;

    while (phase && !cancelled.current) {
      const step = await runBulkUploadStep({ key: staged.key, phase, offset });
      if (!step.ok) {
        toast(step.error, { tone: "error" });
        setBusy(false);
        return;
      }
      created += step.created;
      enriched += step.enriched;
      overall += step.processed;
      setProgress({ phase: step.phase, done: step.nextOffset || step.total, overall, created, enriched });
      phase = step.nextPhase;
      offset = step.nextOffset;
    }

    if (cancelled.current) {
      setBusy(false);
      toast("Stopped. Everything loaded so far was saved — re-running picks up safely.");
      return;
    }

    await finishBulkUpload({ key: staged.key, created, enriched });
    setBusy(false);
    setDone({ created, enriched });
    setStaged(null);
    setProgress(null);
    router.refresh();
  }

  const pct = staged && progress ? Math.round((progress.overall / staged.grandTotal) * 100) : 0;

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 font-display text-3xl font-bold tracking-tight">BULK UPLOAD</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Load a prepared knowledge bundle — a <code>.json</code> file of organizations, people,
        talent, projects, formats, and opportunities extracted from notes. The Repo takes a full
        snapshot first, then loads the bundle in small batches so nothing times out. Records that
        already exist are enriched rather than duplicated, so it is safe to run the same bundle
        twice.
      </p>

      {done && (
        <div className="card mb-4 border-ok p-4">
          <div className="font-display text-lg font-bold">Upload complete</div>
          <p className="mt-1 text-sm text-muted">
            Added {done.created} new records · enriched {done.enriched} existing. Search and the
            AI assistant are already using them.
          </p>
          <button className="btn btn-secondary btn-sm mt-3" onClick={() => setDone(null)}>
            Upload another
          </button>
        </div>
      )}

      {!staged && !done && (
        <div className="card space-y-4 p-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
              Bundle file
            </label>
            <label className="btn btn-primary btn-sm cursor-pointer">
              Choose .json file…
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const text = await file.text();
                  setFileName(file.name);
                  setJson(text);
                  // A bundle can name its own source and link; fall back to the filename.
                  try {
                    const meta = JSON.parse(text) as { title?: unknown; url?: unknown };
                    if (typeof meta?.title === "string" && meta.title.trim()) setTitle(meta.title.trim());
                    else if (!title) setTitle(file.name.replace(/\.json$/i, "").replace(/[-_]/g, " "));
                    if (typeof meta?.url === "string" && meta.url.trim()) setUrl(meta.url.trim());
                  } catch {
                    if (!title) setTitle(file.name.replace(/\.json$/i, "").replace(/[-_]/g, " "));
                  }
                  e.target.value = "";
                }}
              />
            </label>
            {fileName && (
              <span className="ml-3 text-sm">
                <strong>{fileName}</strong>{" "}
                <span className="text-faint">({(json.length / 1024).toFixed(0)} KB)</span>
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                Where this came from
              </label>
              <input
                type="text"
                className="w-full"
                placeholder="4.4.Forty Notes (Google Drive)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                Link (optional)
              </label>
              <input
                type="url"
                className="w-full"
                placeholder="https://drive.google.com/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-faint">
            Every record loaded is stamped with this source, so you can always trace a fact back
            to where it came from.
          </p>

          <button className="btn btn-primary" disabled={!json || busy} onClick={onStage}>
            {busy ? "Checking…" : "Check bundle"}
          </button>
        </div>
      )}

      {staged && (
        <div className="card space-y-4 p-4">
          <div>
            <div className="font-display text-lg font-bold">{staged.fileName || staged.sourceTitle}</div>
            <p className="text-sm text-muted">
              {staged.grandTotal} records ready · source &ldquo;{staged.sourceTitle}&rdquo;
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {IMPORT_PHASES.filter((p) => staged.totals[p] > 0).map((p) => (
              <div key={p} className="card px-3 py-2.5 text-center">
                <div className="font-display text-xl font-bold">{staged.totals[p]}</div>
                <div className="text-xs text-muted">{PHASE_LABELS[p]}</div>
              </div>
            ))}
          </div>

          {progress && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-muted">
                <span>
                  {PHASE_LABELS[progress.phase]} · {progress.created} new, {progress.enriched} enriched
                </span>
                <span>
                  {progress.overall} / {staged.grandTotal}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-wash">
                <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={busy} onClick={onRun}>
              {busy ? "Loading…" : `Import ${staged.grandTotal} records`}
            </button>
            {busy ? (
              <button className="btn btn-secondary" onClick={() => (cancelled.current = true)}>
                Stop
              </button>
            ) : (
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  await discardBulkUpload(staged.key);
                  setStaged(null);
                  setProgress(null);
                  setJson("");
                  setFileName("");
                }}
              >
                Cancel
              </button>
            )}
          </div>
          <p className="text-xs text-faint">
            Keep this tab open while it runs. If it stops early, press Import again — it resumes
            without creating duplicates.
          </p>
        </div>
      )}
    </div>
  );
}
