"use client";

// The panel for bringing a page up to date.
//
// Most of what is in the Repo was imported from two years of old notes and
// emails, so most pages are somewhere between stale and wrong. The fix is not
// a form — nobody is going to open an edit screen four hundred times and work
// out which of fourteen fields changed. The fix is to say, loosely, where the
// thing actually stands, and be shown what that means for the page.
//
// So: a big box, a button, and then every change laid out as before → after,
// ticked by default, with one button to make them all. The same pipeline as
// every other ingest runs underneath, which is what makes the result audited
// and undoable from Add Info; this is a different front door, not a different
// engine.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { wordDiff } from "@/lib/word-diff";
import { PAGE_UPDATE_LABEL, pageUpdateContext } from "@/lib/page-update";
import { applyPageEdit, discardPageEdit, keepAsNoteOnly } from "@/lib/actions/page-edit";

type Proposal = {
  id: string;
  opType: string;
  confidence: number;
  sensitive: boolean;
  path: string | null;
  targetName: string | null;
  field: string | null;
  summary: string;
  before: string;
  after: string;
  rationale: string | null;
};

type Stage =
  | { at: "writing" }
  | { at: "reading"; what: string; since?: number }
  | { at: "review"; itemId: string; proposals: Proposal[]; picked: Set<string>; cost?: string | null }
  | { at: "nothing"; itemId: string; reasons: string[] }
  | { at: "failed"; itemId: string; error: string }
  | { at: "done"; applied: number };

const DRAFT_PREFIX = "update-page-draft:";

/** A running clock, so a long read looks alive rather than stuck. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return <span className="tabular-nums text-faint">{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>;
}

function ElapsedNote({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  if (now - since < 40_000) return null;
  return (
    <p className="mt-2 text-xs text-faint">
      A long note takes longer to read. You can leave this page — the reading carries on, and the changes will be waiting here when you come back.
    </p>
  );
}

function relative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** A change, shown as what it will do to the page. */
function ChangeCard({
  p,
  on,
  pageName,
  toggle,
}: {
  p: Proposal;
  on: boolean;
  pageName: string;
  toggle: () => void;
}) {
  const isTextUpdate = p.opType === "update" && (p.before.length > 40 || p.after.length > 40);
  const aboutThisPage = !p.targetName || p.targetName === pageName;
  // A rename reads like a short update: old name struck through, new name after it.
  const beforeAfter = p.opType === "update" || p.opType === "rename";

  // What to call it: the field for an update, the kind of thing for the rest.
  const heading =
    p.opType === "update"
      ? p.field ?? "Field"
      : p.opType === "rename"
        ? "Name"
        : p.opType === "link"
          ? "Connection"
          : p.opType === "unlink"
            ? "Remove connection"
            : p.opType === "create"
              ? "New record"
              : p.opType === "archive"
                ? "Archive"
                : p.opType === "restore"
                  ? "Back from the Archive"
                  : p.opType === "convert"
                    ? "Move this page"
                    : "Note";

  return (
    <label
      className={`block cursor-pointer rounded-md border px-3.5 py-3 transition-colors ${
        on ? "border-line-strong bg-surface" : "border-line bg-wash/40 opacity-60"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <input type="checkbox" className="mt-1 !w-auto" checked={on} onChange={toggle} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
            <span className="font-semibold uppercase tracking-wide text-muted">{heading}</span>
            {!aboutThisPage && p.targetName && (
              <span className="text-faint">on {p.targetName}</span>
            )}
            {p.sensitive && <span className="text-accent-deep">Sensitive</span>}
            {p.confidence < 0.5 && <span className="text-accent-deep">Not certain</span>}
          </div>

          {beforeAfter ? (
            isTextUpdate ? (
              <div className="mt-1.5 text-sm leading-relaxed">
                {p.before ? (
                  wordDiff(p.before, p.after).map((seg, i) =>
                    seg.type === "same" ? (
                      <span key={i}>{seg.text}</span>
                    ) : seg.type === "added" ? (
                      <span key={i} className="rounded bg-ok-wash px-0.5 text-ok">{seg.text}</span>
                    ) : (
                      <span key={i} className="rounded bg-danger-wash px-0.5 text-danger line-through decoration-danger/50">{seg.text}</span>
                    ),
                  )
                ) : (
                  <span className="rounded bg-ok-wash px-0.5 text-ok">{p.after}</span>
                )}
              </div>
            ) : (
              <div className="mt-1 flex flex-wrap items-baseline gap-2 text-sm">
                {p.before ? (
                  <>
                    <span className="text-muted line-through">{p.before}</span>
                    <span className="text-faint">→</span>
                  </>
                ) : (
                  <span className="text-faint">was empty →</span>
                )}
                <span className="font-medium">{p.after || <span className="text-faint">cleared</span>}</span>
              </div>
            )
          ) : p.opType === "note" && aboutThisPage ? (
            // On the page the note is about, "Note on <this page>:" is noise.
            <div className="mt-1 text-sm">{p.after}</div>
          ) : p.opType === "convert" ? (
            <div className="mt-1 text-sm">
              <div>
                Becomes <span className="font-medium">{p.after || p.summary}</span>
              </div>
              <div className="mt-0.5 text-xs text-muted">
                Everything on this page goes with it — files, connections, sources. This address will forward to the new one.
              </div>
            </div>
          ) : (
            <div className="mt-1 text-sm">{p.summary}</div>
          )}
        </div>
      </div>
    </label>
  );
}

export function UpdatePanelClient({
  targetType,
  targetId,
  name,
  path,
  recordType,
  canEdit,
  lastUpdatedAt,
  lastUpdatedBy,
  next,
  workspace,
  resume = null,
}: {
  targetType: string;
  targetId: string;
  name: string;
  path: string;
  recordType: string;
  canEdit: boolean;
  lastUpdatedAt: string | null;
  lastUpdatedBy: string | null;
  next: { name: string; path: string } | null;
  workspace?: "youtube";
  /** The last note typed here, when it is still being read or has proposals waiting. */
  resume?: { itemId: string; state: "working" | "ready" } | null;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>({ at: "writing" });
  // Read once; a later refresh must not reopen a note that was already dealt with.
  const [resumeSeen, setResumeSeen] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const restored = useRef(false);
  const router = useRouter();
  const { toast } = useToast();
  const draftKey = `${DRAFT_PREFIX}${targetType}:${targetId}`;

  // Half a page of typing is worth keeping across a mis-click. Deferred a
  // tick so the restore is not a state change inside the effect itself, and
  // so the save effect below cannot run first and wipe the draft it reads.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          setText(saved);
          setOpen(true);
        }
      } catch {}
      restored.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, [draftKey]);
  useEffect(() => {
    if (!restored.current) return;
    try {
      if (text) localStorage.setItem(draftKey, text);
      else localStorage.removeItem(draftKey);
    } catch {}
  }, [text, draftKey]);

  useEffect(() => {
    if (open && stage.at === "writing") areaRef.current?.focus();
  }, [open, stage.at]);


  const read = useCallback(
    async (id: string, kick = true) => {
      setStage({ at: "reading", what: "Working out what changes on this page…", since: Date.now() });
      // Typed on the page, so the reader knows what it is about: straight to
      // proposals, in one model call. That call can run for a couple of
      // minutes, and a phone that sleeps or a gateway that gives up drops the
      // reply while the work carries on — so a lost reply is not a failure:
      // the item is watched until it lands, one way or the other.
      let replied = false;
      const since = Date.now();
      if (kick) {
        try {
          const r = await fetch("/api/ingest/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, stage: "propose" }),
          });
          const out = (await r.json()) as { ok?: boolean; error?: string; status?: string };
          replied = true;
          if (!out.ok) return setStage({ at: "failed", itemId: id, error: out.error ?? "Something went wrong reading that." });
        } catch {
          setStage({ at: "reading", what: "Still working — this can take a couple of minutes on a busy page…", since });
        }
      } else {
        setStage({ at: "reading", what: "Still reading the note you left here…", since });
      }
      type Read = { status?: string; error?: string | null; changes?: Proposal[]; reasons?: string[]; cost?: { label: string; calls: number } | null };
      const started = Date.now();
      const LIMIT = 6 * 60_000;
      for (;;) {
        let parsed: Read | null = null;
        try {
          const list = await fetch(`/api/ingest/changes?id=${id}`, { cache: "no-store" });
          if (list.ok) parsed = (await list.json()) as Read;
          else if (replied) return setStage({ at: "failed", itemId: id, error: ((await list.json()) as Read).error ?? "Couldn't read that back." });
        } catch { /* a blip; look again shortly */ }
        if (parsed) {
          const proposals = parsed.changes ?? [];
          if (proposals.length) return setStage({ at: "review", itemId: id, proposals, picked: new Set(proposals.map((p) => p.id)), cost: parsed.cost?.label ?? null });
          if (parsed.status === "proposed" || parsed.status === "irrelevant" || parsed.status === "applied") return setStage({ at: "nothing", itemId: id, reasons: parsed.reasons ?? [] });
          if (parsed.status === "failed") return setStage({ at: "failed", itemId: id, error: parsed.error ?? "Something went wrong reading that." });
          if (replied) return setStage({ at: "nothing", itemId: id, reasons: parsed.reasons ?? [] });
        }
        if (Date.now() - started > LIMIT) {
          return setStage({ at: "failed", itemId: id, error: "This is taking longer than usual. Your text is saved — wait a minute and press Try again." });
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
    },
    [],
  );

  // Back on the page after leaving mid-read: carry on watching, or show what is ready.
  useEffect(() => {
    if (!resume || resume.itemId === resumeSeen) return;
    const t = setTimeout(() => {
      setResumeSeen(resume.itemId);
      setOpen(true);
      void read(resume.itemId, false);
    }, 0);
    return () => clearTimeout(t);
  }, [resume, resumeSeen, read]);

  const submit = useCallback(async () => {
    const overview = text.trim();
    if (!overview || stage.at === "reading") return;
    setStage({ at: "reading", what: "Saving what you wrote…" });
    try {
      const form = new FormData();
      // The page's name leads the text so the matcher lands on this record
      // before anything else; the context tells the reader what to do with it.
      form.set("text", `About: ${name} (${path})\n\n${overview}`);
      form.set(
        "context",
        pageUpdateContext({ targetType, recordType, name, path, today: new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) }),
      );
      form.set("label", `${PAGE_UPDATE_LABEL}${name}`);
      form.set("page", `${targetType}:${targetId}`);
      if (workspace) form.set("workspace", workspace);
      const res = await fetch("/api/ingest/upload", { method: "POST", body: form });
      const data = (await res.json()) as { items?: { id: string }[]; error?: string };
      if (!res.ok || !data.items?.length) {
        toast(data.error ?? "Could not save that.", { tone: "error" });
        return setStage({ at: "writing" });
      }
      await read(data.items[0].id);
    } catch {
      toast("Could not reach the server — your text is still here.", { tone: "error" });
      setStage({ at: "writing" });
    }
  }, [text, stage.at, name, path, recordType, workspace, targetType, targetId, read, toast]);

  const apply = useCallback(async () => {
    if (stage.at !== "review") return;
    const { itemId, picked } = stage;
    setStage({ at: "reading", what: "Making the changes…" });
    const res = await applyPageEdit(itemId, [...picked], { targetType, targetId, name });
    if (!res.ok) {
      toast(res.error ?? "Could not make those changes.", { tone: "error" });
      return setStage({ at: "writing" });
    }
    setText("");
    setStage({ at: "done", applied: res.applied ?? 0 });
    router.refresh();
  }, [stage, targetType, targetId, name, router, toast]);

  if (!canEdit) return null;

  const lastLine = lastUpdatedAt ? (
    <span>
      Brought up to date {relative(lastUpdatedAt)}
      {lastUpdatedBy ? ` by ${lastUpdatedBy}` : ""}
    </span>
  ) : (
    <span>Not yet gone over since the import</span>
  );

  if (!open && stage.at === "writing") {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-line-strong bg-wash/40 px-4 py-3">
        <div className="text-sm">
          <span className="font-semibold">Is this page right?</span>{" "}
          <span className="text-muted">{lastLine}</span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
          Bring it up to date
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-md border border-line-strong bg-surface shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
        <div>
          <span className="text-sm font-semibold">Bring this page up to date</span>
          <span className="ml-2 text-xs text-faint">{lastLine}</span>
        </div>
        {stage.at === "writing" && (
          <button className="text-xs text-muted hover:text-accent" onClick={() => setOpen(false)}>
            Close
          </button>
        )}
      </div>

      {stage.at === "writing" && (
        <div className="p-4">
          <textarea
            ref={areaRef}
            rows={8}
            className="w-full text-sm leading-relaxed"
            placeholder={`Where does ${name} actually stand today? Type it the way you'd tell a colleague — status, who's involved, what's happened, what on this page is wrong. Loose is fine; it gets tidied up.`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-faint">
              Nothing changes until you&apos;ve seen and approved it. ⌘↩ to go.
            </span>
            <button className="btn btn-primary" disabled={!text.trim()} onClick={() => void submit()}>
              Show me the changes
            </button>
          </div>
        </div>
      )}

      {stage.at === "reading" && (
        <div className="p-6 text-sm text-muted">
          <div className="flex items-center gap-3">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
            <span>{stage.what}</span>
            {stage.since && <Elapsed since={stage.since} />}
          </div>
          {stage.since && <ElapsedNote since={stage.since} />}
        </div>
      )}

      {stage.at === "review" && (
        <div className="p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm">
              <span className="font-semibold">
                {stage.proposals.length} change{stage.proposals.length === 1 ? "" : "s"}{stage.cost ? <span className="ml-2 font-normal text-faint" title="Estimated API cost for reading this page">≈ {stage.cost}</span> : null}
              </span>{" "}
              <span className="text-muted">— untick anything that&apos;s wrong. Everything ticked is made together.</span>
            </p>
            <button
              className="text-xs text-muted hover:text-accent"
              onClick={() => {
                const all = stage.picked.size === stage.proposals.length;
                setStage({ ...stage, picked: all ? new Set() : new Set(stage.proposals.map((p) => p.id)) });
              }}
            >
              {stage.picked.size === stage.proposals.length ? "Untick all" : "Tick all"}
            </button>
          </div>

          <div className="space-y-2">
            {stage.proposals.map((p) => (
              <ChangeCard
                key={p.id}
                p={p}
                pageName={name}
                on={stage.picked.has(p.id)}
                toggle={() => {
                  const picked = new Set(stage.picked);
                  if (picked.has(p.id)) picked.delete(p.id);
                  else picked.add(p.id);
                  setStage({ ...stage, picked });
                }}
              />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-3 text-xs">
              <button
                className="text-muted hover:text-accent"
                onClick={async () => {
                  await discardPageEdit(stage.itemId);
                  setStage({ at: "writing" });
                }}
              >
                Start over
              </button>
              <button
                className="text-muted hover:text-accent"
                onClick={async () => {
                  await keepAsNoteOnly(stage.itemId);
                  toast("Kept as a note in Add Info — nothing on the page changed");
                  setText("");
                  setStage({ at: "writing" });
                  setOpen(false);
                }}
              >
                Just keep the text as a note
              </button>
            </div>
            <button className="btn btn-primary" disabled={stage.picked.size === 0} onClick={() => void apply()}>
              Make {stage.picked.size === 1 ? "this change" : `these ${stage.picked.size} changes`}
            </button>
          </div>
        </div>
      )}

      {stage.at === "nothing" && (
        <div className="p-4">
          <p className="text-sm">
            I couldn&apos;t turn that into changes to this page.
            {stage.reasons.length > 0 && <span className="block text-xs text-muted">{stage.reasons.join(" · ")}</span>}
          </p>
          <p className="mt-1 text-xs text-muted">
            Try being concrete about what should be different — a status, who&apos;s attached, what the description should say.
          </p>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={async () => { await discardPageEdit(stage.itemId); setStage({ at: "writing" }); }}>
              Reword
            </button>
            <button className="btn btn-primary btn-sm" onClick={async () => { await keepAsNoteOnly(stage.itemId); toast("Kept as a note"); setText(""); setStage({ at: "writing" }); setOpen(false); }}>
              Keep as a note
            </button>
          </div>
        </div>
      )}

      {stage.at === "failed" && (
        <div className="p-4">
          <p className="text-sm">Your text is saved — I couldn&apos;t read it into changes.</p>
          <p className="mt-1 text-xs text-muted">{stage.error}</p>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={async () => { await discardPageEdit(stage.itemId); setStage({ at: "writing" }); }}>
              Back
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => void read(stage.itemId)}>
              Try again
            </button>
          </div>
        </div>
      )}

      {stage.at === "done" && (
        <div className="p-4">
          <p className="text-sm">
            <span className="font-semibold">Done — {stage.applied} change{stage.applied === 1 ? "" : "s"} made.</span>{" "}
            <span className="text-muted">
              The page below is updated. Undo any of it from{" "}
              <Link href="/uploads" className="underline underline-offset-2 hover:text-accent">Add Info</Link>.
            </span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {next && (
              <Link href={next.path} className="btn btn-primary btn-sm">
                Next: {next.name} →
              </Link>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => setStage({ at: "writing" })}>
              Add more to this page
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
