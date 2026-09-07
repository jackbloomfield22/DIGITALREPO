"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteIdea, promoteIdea, saveIdea } from "@/lib/actions/hq";
import { AutoSelect, AutoText, Stars, TagsField } from "@/components/hq/fields";
import { IDEA_KINDS, IDEA_STATUSES, hqLabel } from "@/lib/hq/vocab";

export type IdeaVM = { id: string; title: string; body: string | null; kind: string; status: string; rating: number; tags: string[]; lastTouchedAt: string; createdAt: string; promotedToId: string | null };

export function IdeaQuickAdd() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("idea");
  const add = () => { const t = title.trim(); if (!t) return; start(async () => { await saveIdea({ title: t, kind }); setTitle(""); router.refresh(); }); };
  return (
    <div className="mb-4 flex gap-2">
      <select value={kind} onChange={(e) => setKind(e.target.value)} className="!w-auto text-sm">{IDEA_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
      <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="A title, a mechanic, a pairing, a rabbit hole — one line is enough for now" className="flex-1 text-sm" />
      <button className="btn btn-primary btn-sm" disabled={pending || !title.trim()} onClick={add}>Save</button>
    </div>
  );
}

export function IdeaCard({ idea }: { idea: IdeaVM }) {
  const router = useRouter();
  const days = Math.floor((new Date().getTime() - new Date(idea.lastTouchedAt).getTime()) / 86_400_000);
  return (
    <Link href={`/hq/ideas/${idea.id}`} className="card block p-3.5 hover:border-line-strong">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium leading-snug">{idea.title}</span>
        <span className="shrink-0 text-xs text-accent">{"★".repeat(idea.rating)}</span>
      </div>
      {idea.body && <div className="mt-1 line-clamp-3 text-sm text-muted">{idea.body}</div>}
      <div className="mt-1.5 flex flex-wrap gap-x-2 text-xs text-faint">
        <span>{hqLabel(IDEA_KINDS, idea.kind)}</span>
        <span>{hqLabel(IDEA_STATUSES, idea.status)}</span>
        <span>{days === 0 ? "today" : `${days}d`}</span>
        {idea.tags.slice(0, 3).map((t) => <span key={t}>#{t}</span>)}
      </div>
      <span className="sr-only" onClick={() => router.refresh()} />
    </Link>
  );
}

export function IdeaEditor({ idea }: { idea: IdeaVM }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const save = (patch: Record<string, unknown>) => saveIdea({ id: idea.id, title: idea.title, ...patch }).then(() => router.refresh());
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
      <div>
        <AutoText value={idea.title} onSave={(v) => saveIdea({ id: idea.id, title: v || idea.title }).then(() => router.refresh())} className="mb-3 [&_input]:font-display [&_input]:text-2xl [&_input]:font-bold" />
        <AutoText value={idea.body} multiline rows={16} placeholder="The mechanic. The why-now. Who it's for. What would make it undeniable. Where the rabbit hole led." onSave={(v) => save({ body: v })} className="[&_textarea]:min-h-[40vh] [&_textarea]:leading-relaxed" />
      </div>
      <div className="space-y-4">
        <div className="card space-y-3 p-4">
          <div><span className="overline mb-1 block">How strong</span><Stars value={idea.rating} onSave={(v) => save({ rating: v })} /></div>
          <AutoSelect label="Kind" value={idea.kind} options={IDEA_KINDS} onSave={(v) => save({ kind: v })} />
          <AutoSelect label="Status" value={idea.status} options={IDEA_STATUSES} onSave={(v) => save({ status: v })} />
          <TagsField label="Tags" value={idea.tags} onSave={(v) => save({ tags: v })} />
        </div>
        <div className="card p-4">
          {idea.promotedToId ? (
            <div className="text-sm">Promoted to a pipeline card: <Link href={`/hq/pipeline/${idea.promotedToId}`} className="font-medium underline hover:text-accent">open it →</Link></div>
          ) : (
            <>
              <button className="btn btn-primary btn-sm w-full" disabled={pending} onClick={() => start(async () => { const r = await promoteIdea(idea.id); if (r.ok) router.push(`/hq/pipeline/${r.pipelineId}`); })}>Promote to the pipeline</button>
              <p className="mt-1.5 text-xs text-faint">Makes a card at the Idea stage with this text as “why it matters”, and marks the idea promoted.</p>
            </>
          )}
        </div>
        <div className="text-xs text-faint">Saved {new Date(idea.createdAt).toLocaleDateString()} · last touched {new Date(idea.lastTouchedAt).toLocaleDateString()}</div>
        <button className="text-xs text-faint hover:text-[#8a3a30]" onClick={() => { if (confirm("Delete this idea?")) start(async () => { await deleteIdea(idea.id); router.push("/hq/ideas"); }); }}>Delete idea</button>
      </div>
    </div>
  );
}
