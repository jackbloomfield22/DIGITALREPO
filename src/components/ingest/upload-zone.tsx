"use client";

// Upload zone + pipeline runner. Files upload in one request; then the
// runner advances items one short stage at a time (parse → triage → propose)
// so no single request approaches the serverless duration limit.

import { useEffect, useRef, useState } from "react";
import { upload as uploadToBlob } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";

type Progress = { done: number; total: number; label: string } | null;

async function runStage(id: string, stage: "parse" | "triage" | "propose"): Promise<{ ok: boolean; error?: string; status?: string }> {
  const res = await fetch("/api/ingest/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, stage }),
  });
  return res.json();
}

type Pick = { type: "format" | "project"; id: string; name: string };

/** "This file is for…" — a typeahead over formats and projects, so a deck lands on its page. */
function ForPicker({ value, onChange }: { value: Pick | null; onChange: (p: Pick | null) => void }) {
  const [type, setType] = useState<"format" | "project">("format");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ q: string; type: string; items: { id: string; name: string; sub?: string }[] }>({ q: "", type: "format", items: [] });
  // Results only count while they match what is typed; nothing to clear when the box empties.
  const items = q.trim() && found.q === q && found.type === type ? found.items : [];
  useEffect(() => {
    if (!q.trim()) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/lookup?${new URLSearchParams({ type, q })}`, { signal: controller.signal });
        if (res.ok) setFound({ q, type, items: (await res.json()) as { id: string; name: string; sub?: string }[] });
      } catch { /* typed on */ }
    }, 200);
    return () => { clearTimeout(t); controller.abort(); };
  }, [q, type]);
  if (value) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">This file is for</span>
        <span className="chip">{value.type === "format" ? "Format" : "Project"}: {value.name}</span>
        <button type="button" className="text-xs underline underline-offset-2 hover:text-accent" onClick={() => onChange(null)}>change</button>
      </div>
    );
  }
  return (
    <div className="mt-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted">This file is for (optional)</span>
        <select className="!w-auto" value={type} onChange={(e) => setType(e.target.value as "format" | "project")} aria-label="Record type">
          <option value="format">a format</option>
          <option value="project">a project</option>
        </select>
        <input type="text" className="!w-56" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Start typing its name…" aria-label="Record name" />
        <span className="text-xs text-faint">The file goes on that page after review. A new page made from this upload gets it too.</span>
      </div>
      {items.length > 0 && (
        <ul className="mt-1 max-w-md divide-y divide-line rounded-md border border-line bg-surface">
          {items.map((i) => (
            <li key={i.id}>
              <button type="button" className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left hover:bg-wash" onClick={() => { onChange({ type, id: i.id, name: i.name }); setQ(""); }}>
                <span>{i.name}</span>{i.sub && <span className="truncate text-xs text-faint">{i.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function UploadZone({ aiAvailable, pendingIds, blobReady = false }: { aiAvailable: boolean; pendingIds: string[]; blobReady?: boolean }) {
  const [attachTo, setAttachTo] = useState<Pick | null>(null);
  const [text, setText] = useState("");
  const [context, setContext] = useState("");
  const [webResearch, setWebResearch] = useState(false);
  // Which part of the Repo this is for. Knowing it up front changes what the
  // reader looks for — a list of names is a slate of films or a list of
  // channel prospects depending entirely on this.
  const [youtube, setYoutube] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<Progress>(null);
  const stopRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();

  /** Advance one item through every stage it can reach. */
  const processItem = async (id: string, label: string, done: number, total: number) => {
    const stages: ("parse" | "triage" | "propose")[] = ["parse", "triage", "propose"];
    for (const stage of stages) {
      if (stopRef.current) return;
      setProgress({ done, total, label: `${label} — ${stage}…` });
      const result = await runStage(id, stage);
      if (!result.ok) {
        if (result.error?.includes("ANTHROPIC_API_KEY")) return; // parsed & stored; proposals need a key
        return; // stage recorded its own error on the item
      }
      if (result.status === "irrelevant" || result.status === "applied") return;
      // After parse, children may exist (zip/mbox/attachments) — they show in
      // the queue as pending and can be processed with "Process pending".
    }
  };

  const runAll = async (ids: { id: string; label: string }[]) => {
    stopRef.current = false;
    for (let i = 0; i < ids.length; i++) {
      if (stopRef.current) break;
      await processItem(ids[i].id, ids[i].label, i + 1, ids.length);
    }
    setProgress(null);
    router.refresh();
  };

  const upload = async (files: File[]) => {
    const form = new FormData();
    // With Blob storage connected, files go straight there from the browser —
    // a request through the app stops at a few megabytes, and decks are bigger.
    // A changes file is tiny and is read by the app, so it still travels inline.
    const direct: { url: string; pathname: string; filename: string; size: number; type: string }[] = [];
    if (blobReady) {
      for (const f of files) {
        if (f.name.toLowerCase().endsWith(".json")) { form.append("files", f); continue; }
        setProgress({ done: 0, total: files.length, label: `Uploading ${f.name}…` });
        try {
          const blob = await uploadToBlob(`ingest/${f.name}`, f, { access: "private", handleUploadUrl: "/api/blob/upload", multipart: f.size > 8 * 1024 * 1024 });
          direct.push({ url: blob.url, pathname: blob.pathname, filename: f.name, size: f.size, type: f.type });
        } catch (e) {
          toast(`${f.name}: ${e instanceof Error ? e.message : "upload failed"}`, { tone: "error" });
          setProgress(null);
          return;
        }
      }
      if (direct.length) form.append("blobs", JSON.stringify(direct));
    } else {
      for (const f of files) form.append("files", f);
    }
    if (attachTo) form.append("attachTo", `${attachTo.type}:${attachTo.id}`);
    if (text.trim()) form.append("text", text.trim());
    if (context.trim()) form.append("context", context.trim());
    if (webResearch) form.append("webResearch", "1");
    if (youtube) form.append("workspace", "youtube");
    setProgress({ done: 0, total: files.length || 1, label: "Uploading…" });
    try {
      const res = await fetch("/api/ingest/upload", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        toast(body.error ?? "Upload failed", { tone: "error" });
        setProgress(null);
        return;
      }
      setText("");
      setContext("");
      setAttachTo(null);
      const skipped =(body.items as { skipped?: string; filename: string | null }[]).filter((i) => i.skipped);
      if (skipped.length) toast(`Skipped: ${skipped.map((s) => s.filename).join(", ")}`, { tone: "error" });
      type Created = { id: string; filename: string | null; skipped?: string; ready?: boolean; stored?: number; invalid?: number; malformed?: number };
      const created = (body.items as Created[]).filter((i) => !i.skipped && i.id);
      // A changes file is already on the review board; there is nothing to run.
      const ready = created.filter((c) => c.ready);
      const toRun = created.filter((c) => !c.ready);
      for (const r of ready) {
        const problems = (r.invalid ?? 0) + (r.malformed ?? 0);
        toast(
          `${r.stored ?? 0} change${r.stored === 1 ? "" : "s"} ready to review` +
            (problems ? ` — ${problems} could not be read and were left out` : ""),
          { tone: problems ? "error" : undefined },
        );
      }
      if (toRun.length) toast(`Ingesting ${toRun.length} item${toRun.length === 1 ? "" : "s"}…`);
      router.refresh();
      if (toRun.length) await runAll(toRun.map((c) => ({ id: c.id, label: c.filename ?? "pasted text" })));
      else setProgress(null);
      if (ready.length === 1 && !toRun.length) router.push(`/ingest/${ready[0].id}`);
    } catch {
      toast("Upload failed", { tone: "error" });
      setProgress(null);
    }
  };

  return (
    <div className="card mb-8 p-4">
      <div
        className={`rounded-md border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${
          dragOver ? "border-accent bg-accent-wash" : "border-line-strong text-muted"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = [...e.dataTransfer.files];
          if (files.length) upload(files);
        }}
      >
        Drop emails and documents here — .eml, .mbox, .zip, .pdf, .docx, .pptx, .xlsx, .csv, .txt, .md, .html — or a
        changes file (.json) from Claude, which goes straight to review with no AI call
        <div className="mt-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            accept=".eml,.msg,.mbox,.zip,.pdf,.docx,.pptx,.xlsx,.csv,.txt,.md,.html,.htm,.json"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              if (files.length) upload(files);
              e.target.value = "";
            }}
          />
          <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
            Choose Files…
          </button>
        </div>
      </div>

      <div className="mt-3">
        <textarea
          rows={3}
          placeholder="…or paste research, an email, or notes here"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Paste research"
        />
        <textarea
          rows={2}
          className="mt-2"
          placeholder="Context (optional) — what is this, and what should we pay attention to? e.g. “Thread about the Nike deal; care about who reps whom.”"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          aria-label="Context for this upload"
        />
        <ForPicker value={attachTo} onChange={setAttachTo} />
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            className="h-4 w-4 accent-current"
            checked={webResearch}
            onChange={(e) => setWebResearch(e.target.checked)}
          />
          <span>
            <span className="font-medium">Internet research</span> — let the AI run a few web
            searches to fill gaps the document leaves open (web-sourced facts are marked and
            get lower confidence)
          </span>
        </label>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            className="h-4 w-4 accent-current"
            checked={youtube}
            onChange={(e) => setYoutube(e.target.checked)}
          />
          <span>
            <span className="font-medium">YouTube channels</span> — this is material for the
            athlete channels business, so read it that way: a name on a list is a channel to
            chase, and a bullet under one is something that channel could make
          </span>
        </label>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-faint">
            {aiAvailable
              ? "Everything is parsed, triaged, and turned into reviewable proposals — nothing is saved to the Repo until you approve it."
              : "No ANTHROPIC_API_KEY configured: files are parsed and stored, but AI proposals are off until a key is added."}
          </span>
          <div className="flex gap-2">
            {pendingIds.length > 0 && !progress && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => runAll(pendingIds.map((id) => ({ id, label: "pending item" })))}
              >
                Process {pendingIds.length} Pending
              </button>
            )}
            <button className="btn btn-primary btn-sm" disabled={!text.trim() || !!progress} onClick={() => upload([])}>
              Capture Text
            </button>
          </div>
        </div>
      </div>

      {progress && (
        <div className="mt-3 flex items-center gap-3 rounded bg-wash px-3 py-2 text-sm">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
          <span className="min-w-0 flex-1 truncate">
            {progress.label} ({progress.done}/{progress.total})
          </span>
          <div className="h-1.5 w-32 overflow-hidden rounded bg-line">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
            />
          </div>
          <button
            className="text-xs underline underline-offset-2"
            onClick={() => {
              stopRef.current = true;
              setProgress(null);
              router.refresh();
            }}
          >
            Stop
          </button>
        </div>
      )}
    </div>
  );
}
