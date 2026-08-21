"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  applyInboxItem,
  dismissInboxItem,
  proposeInboxItem,
  submitInboxItem,
} from "@/lib/actions/inbox";
import { useToast } from "@/components/toast";
import type { Proposal, ProposalOp } from "@/lib/ai/inbox";

function opLabel(op: ProposalOp): string {
  switch (op.op) {
    case "create_creator": return `Create creator “${op.name}” (or use existing)`;
    case "create_project": return `Create project “${op.title}”${op.projectType ? ` (${op.projectType.replace(/_/g, " ")})` : ""}`;
    case "create_organization": return `Create organization “${op.name}”${op.orgType ? ` (${op.orgType.replace(/_/g, " ")})` : ""}`;
    case "create_entity": return `Create ${op.kind.replace(/_/g, " ")} “${op.name}”`;
    case "link_credit": return `Link ${op.creatorName} → ${op.projectTitle} as ${op.role.replace(/_/g, " ")}`;
    case "link_project_org": return `Link ${op.projectTitle} → ${op.orgName} (${op.relationship.replace(/_/g, " ")})`;
    case "link_creator_org": return `Link ${op.creatorName} → ${op.orgName} (${op.relationship.replace(/_/g, " ")})`;
    case "link_creator_entity": return `Add ${op.entityName} (${op.entityKind.replace(/_/g, " ")}) to ${op.creatorName}`;
    case "link_creator_format": return `Attach ${op.creatorName} to format ${op.formatTitle}`;
    case "add_social": return `Social for ${op.creatorName}: ${op.platform}${op.handle ? ` @${op.handle}` : ""}${op.followers != null ? ` (${op.followers.toLocaleString()})` : ""}`;
    case "set_creator_bio": return `Set ${op.creatorName} ${op.field} (only if empty)`;
    case "note": return `Note only: ${op.text}`;
  }
}

type Item = {
  id: string;
  rawText: string;
  status: string;
  proposal: Proposal | null;
  createdBy: string;
  createdAt: string;
};

export function InboxClient({
  canEdit,
  available,
  items,
  appliedCount,
}: {
  canEdit: boolean;
  available: boolean;
  items: Item[];
  appliedCount: number;
}) {
  const [text, setText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [report, setReport] = useState<{ applied: string[]; created: string[]; skipped: string[] } | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 font-display text-3xl font-bold tracking-tight">RESEARCH INBOX</h1>
      <p className="mb-6 text-sm text-muted">
        Paste anything you learn — an announcement, a paragraph from a call, a whole creator
        one-sheet. {available ? "AI turns it into proposed database changes you review before anything is saved." : "AI parsing is not configured, but notes are kept here for manual entry."}
      </p>

      {canEdit && (
        <div className="card mb-8 p-4">
          <textarea
            rows={5}
            placeholder={`e.g. "Maya Delgado launched a new YouTube show called Counters with Halcyon North. She hosts and executive produces it. Voltix sponsors season one."`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Paste research"
          />
          <div className="mt-3 flex justify-end">
            <button
              className="btn btn-primary"
              disabled={submitting || !text.trim()}
              onClick={async () => {
                setSubmitting(true);
                const res = await submitInboxItem(text);
                if (res.ok && res.id) {
                  setText("");
                  if (available) {
                    toast("Saved — parsing with AI…");
                    const parsed = await proposeInboxItem(res.id);
                    if (!parsed.ok) toast(parsed.error ?? "Parsing failed", { tone: "error" });
                  } else {
                    toast("Saved to inbox");
                  }
                  router.refresh();
                } else toast(res.error ?? "Failed", { tone: "error" });
                setSubmitting(false);
              }}
            >
              {submitting ? "Working…" : available ? "Capture & Parse" : "Capture"}
            </button>
          </div>
        </div>
      )}

      {report && (
        <div className="card mb-6 border-ok/40 p-4 text-sm">
          <div className="overline mb-2">Applied</div>
          {report.created.length > 0 && (
            <p className="mb-1"><strong>New records:</strong> {report.created.join(" · ")}</p>
          )}
          {report.applied.length > 0 && (
            <p className="mb-1"><strong>Links:</strong> {report.applied.join(" · ")}</p>
          )}
          {report.skipped.length > 0 && (
            <p className="text-muted"><strong>Skipped:</strong> {report.skipped.join(" · ")}</p>
          )}
          <button className="btn btn-ghost btn-sm mt-2" onClick={() => setReport(null)}>Dismiss</button>
        </div>
      )}

      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="card p-4">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-faint">
              <span>{item.createdBy} · {new Date(item.createdAt).toLocaleDateString()}</span>
              <span className="kind-badge kind-project">{item.status}</span>
            </div>
            <p className="whitespace-pre-line text-sm text-charcoal">{item.rawText}</p>

            {item.proposal && (
              <div className="mt-3 rounded-md bg-wash p-3">
                <div className="overline mb-2">Proposed Changes</div>
                {item.proposal.summary && (
                  <p className="mb-2 text-sm italic text-muted">{item.proposal.summary}</p>
                )}
                <ul className="space-y-1 text-sm">
                  {item.proposal.ops.map((op, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-accent">›</span>
                      {opLabel(op)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {canEdit && (
              <div className="mt-3 flex flex-wrap gap-2">
                {item.status === "pending" && available && (
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={busyId === item.id}
                    onClick={async () => {
                      setBusyId(item.id);
                      const res = await proposeInboxItem(item.id);
                      if (!res.ok) toast(res.error ?? "Failed", { tone: "error" });
                      setBusyId(null);
                      router.refresh();
                    }}
                  >
                    {busyId === item.id ? "Parsing…" : "Parse with AI"}
                  </button>
                )}
                {item.status === "proposed" && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busyId === item.id}
                    onClick={async () => {
                      setBusyId(item.id);
                      const res = await applyInboxItem(item.id);
                      if (res.ok) {
                        setReport({ applied: res.applied ?? [], created: res.created ?? [], skipped: res.skipped ?? [] });
                        toast("Changes applied");
                      } else toast(res.error ?? "Apply failed", { tone: "error" });
                      setBusyId(null);
                      router.refresh();
                    }}
                  >
                    {busyId === item.id ? "Applying…" : "Apply Changes"}
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={async () => {
                    await dismissInboxItem(item.id);
                    toast("Dismissed");
                    router.refresh();
                  }}
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-faint">
            Inbox is clear{appliedCount ? ` — ${appliedCount} recently applied` : ""}.
          </p>
        )}
      </div>
    </div>
  );
}
