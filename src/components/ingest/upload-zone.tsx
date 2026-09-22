"use client";

// Upload zone + pipeline runner. Files upload in one request; then the
// runner advances items one short stage at a time (parse → triage → propose)
// so no single request approaches the serverless duration limit.

import { Combobox, lookupItems } from "@/components/combobox";
import { useMemo, useRef, useState } from "react";
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

type PickType = "format" | "project" | "creator";
type Pick = { type: PickType; id: string; name: string };
const PICK_LABEL: Record<PickType, string> = { format: "Format", project: "Project", creator: "Talent" };

/** "This file is for…" — a typeahead over formats, projects and talent, so a deck lands on its page. */
function ForPicker({ value, onChange }: { value: Pick | null; onChange: (p: Pick | null) => void }) {
  const [type, setType] = useState<PickType>("format");
  const fetchItems = useMemo(() => lookupItems(type), [type]);
  if (value) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">This file is for</span>
        <span className="chip">{PICK_LABEL[value.type]}: {value.name}</span>
        <button type="button" className="text-xs underline underline-offset-2 hover:text-accent" onClick={() => onChange(null)}>change</button>
      </div>
    );
  }
  return (
    <div className="mt-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted">This file is for (optional)</span>
        <select className="!w-auto" value={type} onChange={(e) => setType(e.target.value as PickType)} aria-label="Record type">
          <option value="format">a format</option>
          <option value="project">a project</option>
          <option value="creator">a talent</option>
        </select>
        <span className="text-xs text-faint">The file goes on that page. A picture or video lands there straight away; a document lands after its proposals are reviewed.</span>
      </div>
      <Combobox
        className="mt-1 max-w-md"
        aria-label="Record name"
        placeholder="Start typing its name…"
        minChars={1}
        fetchItems={fetchItems}
        listClassName="empty:hidden"
        onPick={(i) => onChange({ type, id: i.id, name: i.name })}
      />
    </div>
  );
}

const MEDIA_RE = /\.(png|jpe?g|gif|webp|heic|heif|avif|svg|bmp|tiff?|psd|mp4|mov|m4v|webm|avi|mkv|mp3|m4a|wav|aac|ogg|flac)$/i;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)}MB`;

export function UploadZone({ aiAvailable, pendingIds, blobReady = false, maxInlineBytes, blobHint }: { aiAvailable: boolean; pendingIds: string[]; blobReady?: boolean; maxInlineBytes: number; blobHint: string }) {
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
        if (result.error?.includes("ANTHROPIC_API_KEY")) {
          toast(`${label} is stored, but nothing can be proposed from it: the site has no AI key configured.`, { tone: "error" });
          return;
        }
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
    // Say no here, in words, rather than let the platform refuse the request
    // with a bare 413 that the page could only report as "Upload failed".
    if (!blobReady) {
      const big = files.find((f) => f.size > maxInlineBytes);
      const total = files.reduce((n, f) => n + f.size, 0);
      if (big || total > maxInlineBytes) {
        const what = big ? `${big.name} is ${mb(big.size)}` : `These files add up to ${mb(total)}`;
        toast(`${what}. Without file storage connected, one Ingest upload can carry ${mb(maxInlineBytes)}. ${blobHint}`, { tone: "error", duration: 15000 });
        return;
      }
    }
    // A picture or video has nothing to read, so it only makes sense with a
    // page to land on. Ask for one up front instead of parking it as irrelevant.
    const media = files.filter((f) => MEDIA_RE.test(f.name));
    if (media.length && !attachTo) {
      toast(`${media[0].name} is a picture, video or audio file: there is nothing in it to read. Choose the page it is for under “This file is for” and it will be added there.`, { tone: "error", duration: 12000 });
      return;
    }
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
      const raw = await res.text();
      let body: { error?: string; items?: unknown[] } = {};
      try { body = JSON.parse(raw); } catch { body = {}; }
      if (!res.ok) {
        // A refusal from the platform itself carries no JSON; the status is the whole message.
        const reason = body.error
          ?? (res.status === 413
            ? `The upload was too big for this site to take in one request. ${blobHint}`
            : `The site returned an error (${res.status}) before it could read the upload.`);
        toast(reason, { tone: "error", duration: 15000 });
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
    } catch (e) {
      toast(`The upload did not reach the site: ${e instanceof Error ? e.message : "the connection dropped"}. Check the connection and try again.`, { tone: "error", duration: 12000 });
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
        Drop anything here. Emails (.eml, .mbox), documents, decks, spreadsheets, notes and web pages are read
        for what matters. Pictures, video and audio go straight onto the page you name below. A zip of any of
        it is unpacked. A changes file (.json) from Claude goes straight to review with no AI call.
        {!blobReady && <span className="mt-1 block text-xs text-faint">Up to {mb(maxInlineBytes)} per upload until file storage is connected.</span>}
        <div className="mt-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            aria-label="Choose files to upload"
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
          rows={8}
          placeholder="…or paste anything here: an email thread, meeting notes, a research dump, a list of names. It is read, matched against what the Repo already knows, and comes back as proposals to approve: new pages, updates to existing ones, links between them."
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
              ? "Everything is read, matched and turned into proposals — new pages, updates, links. Nothing is saved to the Repo until you approve it."
              : "This site has no AI key configured: what you add is stored, but nothing will be proposed from it until ANTHROPIC_API_KEY is set in Vercel."}
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
