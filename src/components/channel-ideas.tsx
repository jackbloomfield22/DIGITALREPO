"use client";

// The queue of things a channel could make. On the slate this is the whole
// entry — "doc series, podcast, Maxey drill, content with the dogs" — so
// adding one has to be as quick as typing it into a document, or it will go on
// being typed into a document instead.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { StatusPill } from "@/components/ui";
import { CHANNEL_IDEA_STATUSES, labelFor } from "@/lib/taxonomy";
import { addChannelIdea, removeChannelIdea, setChannelIdea } from "@/lib/actions/channels";

export type IdeaVM = { id: string; title: string; status: string; notes: string | null };

export function ChannelIdeas({
  channelId,
  ideas,
  canEdit,
}: {
  channelId: string;
  ideas: IdeaVM[];
  canEdit: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const add = async () => {
    const title = draft.trim();
    if (!title || busy) return;
    setBusy(true);
    const res = await addChannelIdea(channelId, title);
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "Could not add that.", { tone: "error" });
    setDraft("");
    router.refresh();
  };

  return (
    <div className="space-y-2">
      {ideas.length === 0 && (
        <p className="text-sm text-faint">
          Nothing queued yet{canEdit ? " — type an idea below and press enter." : "."}
        </p>
      )}

      <ul className="space-y-1.5">
        {ideas.map((idea) => (
          <li key={idea.id} className="card flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1 text-sm">{idea.title}</span>
            {canEdit ? (
              <span className="relative inline-flex items-center">
                <StatusPill status={idea.status} label={labelFor(idea.status)} />
                <span aria-hidden className="ml-0.5 text-[9px] text-faint">▾</span>
                <select
                  aria-label={`Status for ${idea.title}`}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  value={idea.status}
                  onChange={async (e) => {
                    const res = await setChannelIdea(idea.id, { status: e.target.value });
                    if (!res.ok) return toast(res.error ?? "Could not update.", { tone: "error" });
                    router.refresh();
                  }}
                >
                  {CHANNEL_IDEA_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </span>
            ) : (
              <StatusPill status={idea.status} label={labelFor(idea.status)} />
            )}
            {canEdit && (
              <button
                aria-label={`Remove ${idea.title}`}
                className="text-muted hover:text-accent"
                onClick={async () => {
                  if (!window.confirm(`Remove "${idea.title}" from the queue?`)) return;
                  const res = await removeChannelIdea(idea.id);
                  if (!res.ok) return toast(res.error ?? "Could not remove.", { tone: "error" });
                  router.refresh();
                }}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <div className="flex max-w-lg gap-2">
          <input
            type="text"
            placeholder="Add an idea — “doc series”, “Maxey drill”, “content with the dogs”…"
            value={draft}
            aria-label="New idea"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
          />
          <button className="btn btn-secondary btn-sm shrink-0" disabled={!draft.trim() || busy} onClick={add}>
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      )}
    </div>
  );
}
