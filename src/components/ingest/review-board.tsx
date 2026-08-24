"use client";

// Review board: source text on the left (with evidence highlighting), change
// cards grouped by destination on the right. Approve / edit / reject per
// card, bulk actions, keyboard (J/K move, A approve, R reject, E edit),
// apply with a result summary.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  applyIngestChanges,
  bulkApprove,
  bulkReject,
  editChange,
  markIrrelevant,
  setChangeStatus,
} from "@/lib/actions/ingest";
import { wordDiff } from "@/lib/word-diff";
import { useToast } from "@/components/toast";
import { StatusPill } from "@/components/ui";
import type { ApplyOutcome } from "@/lib/ingest/apply";

function RetryButton({ item }: { item: ItemVM }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  // Resume from wherever the item got to: no text → re-parse; text but no
  // triage verdict → triage; otherwise straight to proposing again.
  const stage = !item.text.trim() ? "parse" : item.relevance ? "propose" : "triage";

  const retry = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/ingest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, stage }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        toast("Retried — reloading…");
        router.refresh();
      } else {
        toast(body.error ?? "Retry failed", { tone: "error" });
      }
    } catch {
      toast("Network error — try again.", { tone: "error" });
    }
    setBusy(false);
  };

  return (
    <button className="btn btn-secondary btn-sm mt-3" disabled={busy} onClick={retry}>
      {busy ? "Retrying…" : `Retry (${stage})`}
    </button>
  );
}

export type ItemVM = {
  id: string;
  kind: string;
  status: string;
  filename: string | null;
  text: string;
  strippedText: string | null;
  headers: { from: string; to: string; cc: string; date: string; subject: string } | null;
  error: string | null;
  relevance: { score: number | null; reasons: string[] } | null;
  proposeInfo: { coveredChars: number; totalChars: number; invalidOps?: string[] } | null;
};

export type ChangeVM = {
  id: string;
  group: string;
  opType: string;
  destinationPath: string | null;
  destinationName: string;
  field: string | null;
  before: string | null;
  after: unknown;
  editedValue: string | null;
  confidence: number;
  rationale: string | null;
  evidence: { snippet: string; start: number; end: number }[];
  sensitive: boolean;
  status: string;
  error: string | null;
};

const OP_BADGE: Record<string, string> = {
  create: "bg-[#eef2ec] text-ok",
  update: "bg-[#f5efdd] text-warn",
  link: "bg-accent-wash text-accent-deep",
  archive: "bg-ink text-paper",
  note: "bg-wash text-muted",
};

function afterText(change: ChangeVM): string {
  if (change.editedValue != null) return change.editedValue;
  if (typeof change.after === "string" || typeof change.after === "number") return String(change.after);
  const after = change.after as Record<string, unknown>;
  if (change.opType === "link") return [after.a, "→", after.b, after.role ? `(${after.role})` : ""].filter(Boolean).join(" ");
  if (change.opType === "note") return String(after.text ?? "");
  if (change.opType === "archive") return `Archive — ${after.reason}`;
  return Object.entries(after ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

function SourcePane({ item, activeSpans }: { item: ItemVM; activeSpans: { start: number; end: number }[] }) {
  const spanRef = useRef<HTMLElement>(null);
  useEffect(() => {
    spanRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeSpans]);

  const segments = useMemo(() => {
    const valid = activeSpans.filter((s) => s.start >= 0 && s.end > s.start).sort((a, b) => a.start - b.start);
    const out: { text: string; active: boolean }[] = [];
    let cursor = 0;
    for (const span of valid) {
      if (span.start > cursor) out.push({ text: item.text.slice(cursor, span.start), active: false });
      out.push({ text: item.text.slice(span.start, span.end), active: true });
      cursor = Math.max(cursor, span.end);
    }
    if (cursor < item.text.length) out.push({ text: item.text.slice(cursor), active: false });
    return out;
  }, [item.text, activeSpans]);

  let firstActiveRendered = false;
  return (
    <div className="card sticky top-4 max-h-[80vh] overflow-y-auto p-4 text-sm leading-relaxed">
      {item.headers && (
        <div className="mb-3 space-y-0.5 border-b border-line pb-3 text-xs">
          <div><span className="text-muted">From:</span> {item.headers.from}</div>
          <div><span className="text-muted">To:</span> {item.headers.to}</div>
          {item.headers.cc && <div><span className="text-muted">Cc:</span> {item.headers.cc}</div>}
          <div><span className="text-muted">Date:</span> {item.headers.date}</div>
          <div className="font-semibold">{item.headers.subject}</div>
        </div>
      )}
      <div className="whitespace-pre-wrap">
        {segments.map((segment, i) => {
          if (!segment.active) return <span key={i}>{segment.text}</span>;
          const ref = !firstActiveRendered ? spanRef : undefined;
          firstActiveRendered = true;
          return (
            <mark key={i} ref={ref as React.Ref<HTMLElement>} className="rounded bg-accent-wash px-0.5 text-accent-deep">
              {segment.text}
            </mark>
          );
        })}
        {!item.text && <span className="text-faint">No text content.</span>}
      </div>
      {item.strippedText && (
        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-xs font-semibold text-muted">
            Quoted / stripped content
          </summary>
          <div className="mt-2 whitespace-pre-wrap text-xs text-faint">{item.strippedText}</div>
        </details>
      )}
    </div>
  );
}

function ChangeCard({
  change,
  active,
  canEdit,
  onHover,
  onAction,
}: {
  change: ChangeVM;
  active: boolean;
  canEdit: boolean;
  onHover: () => void;
  onAction: (action: "approved" | "rejected" | "pending" | "edit", value?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(afterText(change));
  const isTextUpdate = change.opType === "update" || change.opType === "note";
  const terminal = ["applied", "failed"].includes(change.status);

  return (
    <div
      data-change-id={change.id}
      className={`card p-3.5 transition-shadow ${active ? "shadow-pop outline outline-2 outline-accent/40" : ""} ${
        change.status === "rejected" ? "opacity-55" : ""
      }`}
      onMouseEnter={onHover}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`kind-badge ${OP_BADGE[change.opType] ?? "kind-project"}`}>{change.opType}</span>
        {change.destinationPath ? (
          <Link href={change.destinationPath} className="truncate text-sm font-semibold hover:text-accent-deep hover:underline">
            {change.group}
          </Link>
        ) : (
          <span className="truncate text-sm font-semibold">{change.group}</span>
        )}
        {change.field && <span className="text-xs text-muted">· {change.field}</span>}
        {change.sensitive && (
          <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-paper">
            Sensitive
          </span>
        )}
        <span className="ml-auto text-xs text-faint">{Math.round(change.confidence * 100)}%</span>
        <StatusPill status={change.status} label={change.status} />
      </div>

      <div className="mt-2 text-sm">
        {change.before != null && isTextUpdate && !editing ? (
          <div className="rounded bg-wash/60 p-2 leading-relaxed">
            {wordDiff(change.before, afterText(change)).map((segment, i) =>
              segment.type === "same" ? (
                <span key={i}>{segment.text}</span>
              ) : segment.type === "added" ? (
                <span key={i} className="rounded bg-[#dcead9] text-ok">{segment.text}</span>
              ) : (
                <span key={i} className="rounded bg-accent-wash text-accent-deep line-through">{segment.text}</span>
              ),
            )}
          </div>
        ) : editing ? (
          <div>
            <textarea rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Edited value" />
            <div className="mt-1.5 flex gap-2">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  onAction("edit", draft);
                  setEditing(false);
                }}
              >
                Save Edit
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-wrap">{afterText(change)}</div>
        )}
      </div>

      {change.rationale && <p className="mt-1.5 text-xs text-muted">{change.rationale}</p>}
      {change.evidence[0] && (
        <p className="mt-1 border-l-2 border-line pl-2 text-xs italic text-faint">“{change.evidence[0].snippet.slice(0, 200)}”</p>
      )}
      {change.error && <p className="mt-1.5 text-xs text-accent-deep">⚠ {change.error}</p>}

      {canEdit && !terminal && !editing && (
        <div className="mt-2.5 flex gap-1.5">
          {change.status !== "approved" && change.status !== "edited" ? (
            <button className="btn btn-primary btn-sm" onClick={() => onAction("approved")}>Approve</button>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={() => onAction("pending")}>Un-approve</button>
          )}
          {isTextUpdate && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setDraft(afterText(change));
                setEditing(true);
              }}
            >
              Edit
            </button>
          )}
          {change.status !== "rejected" ? (
            <button className="btn btn-ghost btn-sm" onClick={() => onAction("rejected")}>Reject</button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => onAction("pending")}>Restore</button>
          )}
        </div>
      )}
    </div>
  );
}

export function ReviewBoard({ item, changes, canEdit }: { item: ItemVM; changes: ChangeVM[]; canEdit: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [threshold, setThreshold] = useState(0.8);
  const [applying, setApplying] = useState(false);
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const reviewable = changes.filter((c) => !["applied"].includes(c.status));
  const approvedCount = changes.filter((c) => ["approved", "edited"].includes(c.status)).length;
  const active = reviewable[activeIndex] ?? null;

  const groups = useMemo(() => {
    const map = new Map<string, ChangeVM[]>();
    for (const change of changes) {
      (map.get(change.group) ?? map.set(change.group, []).get(change.group)!).push(change);
    }
    return [...map.entries()];
  }, [changes]);

  const act = async (change: ChangeVM, action: "approved" | "rejected" | "pending" | "edit", value?: string) => {
    const result =
      action === "edit"
        ? await editChange(change.id, value ?? "")
        : await setChangeStatus(change.id, action);
    if (!result.ok) toast(result.error ?? "Failed", { tone: "error" });
    router.refresh();
  };

  // Keyboard: J/K move, A approve, R reject, E edit-focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const key = e.key.toLowerCase();
      if (key === "j") setActiveIndex((i) => Math.min(i + 1, reviewable.length - 1));
      else if (key === "k") setActiveIndex((i) => Math.max(i - 1, 0));
      else if (key === "a" && active && canEdit) act(active, "approved");
      else if (key === "r" && active && canEdit) act(active, "rejected");
      else if (key === "e" && active) {
        document.querySelector(`[data-change-id="${active.id}"] button.btn-secondary`)?.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, reviewable.length, canEdit]);

  if (item.status === "failed" && !changes.length) {
    return (
      <div className="card border-accent/40 p-5 text-sm">
        <p className="font-medium text-accent-deep">This item failed: {item.error}</p>
        {canEdit && <RetryButton item={item} />}
      </div>
    );
  }

  return (
    <div>
      {item.relevance && (
        <div className="mb-4 rounded-md bg-wash px-4 py-2.5 text-sm text-muted">
          {item.status === "irrelevant" ? "Marked irrelevant" : "Relevance"}
          {item.relevance.score != null && ` (${Math.round(item.relevance.score * 100)}%)`}
          {item.relevance.reasons.length > 0 && `: ${item.relevance.reasons.join("; ")}`}
        </div>
      )}
      {item.proposeInfo && item.proposeInfo.coveredChars < item.proposeInfo.totalChars && (
        <div className="mb-4 rounded-md bg-[#f5efdd] px-4 py-2.5 text-sm text-warn">
          This document is long — proposals cover the first{" "}
          {(item.proposeInfo.coveredChars / 1000).toFixed(0)}k of {(item.proposeInfo.totalChars / 1000).toFixed(0)}k characters.
        </div>
      )}

      {outcome && (
        <div className="card mb-4 border-ok/40 p-4 text-sm">
          <p className="font-medium">
            Applied {outcome.applied} change{outcome.applied === 1 ? "" : "s"}
            {outcome.superseded > 0 && ` · ${outcome.superseded} superseded (a colleague edited the record — re-review below)`}
            {outcome.failed > 0 && ` · ${outcome.failed} failed`}
          </p>
          {outcome.touched.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {outcome.touched.map((t) =>
                t.path ? (
                  <Link key={`${t.targetType}:${t.targetId}`} href={t.path} className="chip">{t.name}</Link>
                ) : (
                  <span key={`${t.targetType}:${t.targetId}`} className="chip">{t.name}</span>
                ),
              )}
            </div>
          )}
        </div>
      )}

      {canEdit && changes.length > 0 && (
        <div className="sticky top-0 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface/95 px-4 py-2.5 shadow-card backdrop-blur">
          <span className="text-sm font-medium">{approvedCount} approved</span>
          <span className="text-xs text-faint">J/K move · A approve · R reject · E edit</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted">
              Approve ≥
              <input
                type="number"
                min={0}
                max={100}
                value={Math.round(threshold * 100)}
                onChange={(e) => setThreshold(Number(e.target.value) / 100)}
                className="!w-16 !py-1"
                aria-label="Confidence threshold"
              />
              %
            </label>
            <button
              className="btn btn-secondary btn-sm"
              onClick={async () => {
                const result = await bulkApprove(item.id, threshold);
                toast(result.ok ? `Approved ${result.count} (archives & sensitive excluded)` : (result.error ?? "Failed"), result.ok ? {} : { tone: "error" });
                router.refresh();
              }}
            >
              Bulk Approve
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                const result = await bulkReject(item.id);
                toast(result.ok ? `Rejected ${result.count}` : (result.error ?? "Failed"), result.ok ? {} : { tone: "error" });
                router.refresh();
              }}
            >
              Reject All
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={applying || approvedCount === 0}
              onClick={async () => {
                setApplying(true);
                const result = await applyIngestChanges(item.id);
                setApplying(false);
                if (result.ok && result.outcome) {
                  setOutcome(result.outcome);
                  toast(`Applied ${result.outcome.applied} changes`);
                } else toast(result.error ?? "Apply failed", { tone: "error" });
                router.refresh();
              }}
            >
              {applying ? "Applying…" : `Apply ${approvedCount} Approved`}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,2fr)_3fr]">
        <SourcePane item={item} activeSpans={active?.evidence ?? []} />
        <div className="space-y-5">
          {groups.map(([group, groupChanges]) => (
            <section key={group}>
              <h2 className="overline mb-2">{group}</h2>
              <div className="space-y-2">
                {groupChanges.map((change) => (
                  <ChangeCard
                    key={change.id}
                    change={change}
                    active={active?.id === change.id}
                    canEdit={canEdit}
                    onHover={() => {
                      const idx = reviewable.findIndex((c) => c.id === change.id);
                      if (idx >= 0) setActiveIndex(idx);
                    }}
                    onAction={(action, value) => act(change, action, value)}
                  />
                ))}
              </div>
            </section>
          ))}
          {changes.length === 0 && (
            <div className="rounded-md border border-dashed border-line-strong bg-wash/50 px-6 py-10 text-center text-sm text-muted">
              {item.status === "proposed"
                ? "No changes were proposed for this item."
                : item.status === "irrelevant"
                  ? "Triage judged this item irrelevant — nothing to review."
                  : "Run the pipeline from the queue to generate proposals."}
            </div>
          )}
          {canEdit && item.status !== "applied" && item.status !== "irrelevant" && changes.length === 0 && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                await markIrrelevant(item.id);
                toast("Marked irrelevant");
                router.push("/ingest");
                router.refresh();
              }}
            >
              Dismiss as irrelevant
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
