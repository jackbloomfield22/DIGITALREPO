"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteNote, saveNote } from "@/lib/actions/hq";
import { AutoSelect, AutoText, TagsField } from "@/components/hq/fields";
import { PersonPicker, CardPicker } from "@/components/hq/pickers";
import { NOTE_KINDS } from "@/lib/hq/vocab";

export type NoteVM = { id: string; title: string; body: string; kind: string; tags: string[]; pinned: boolean; relationship: { id: string; name: string } | null; pipeline: { id: string; title: string } | null };

export function NoteEditor({ note }: { note: NoteVM }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const save = (patch: Record<string, unknown>) => saveNote({ id: note.id, title: note.title, ...patch }).then(() => router.refresh());
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
      <div>
        <AutoText value={note.title} onSave={(v) => saveNote({ id: note.id, title: v || "Untitled" }).then(() => router.refresh())} className="mb-3 [&_input]:font-display [&_input]:text-2xl [&_input]:font-bold" />
        <AutoText value={note.body} multiline rows={22} placeholder="Write. It saves as you go, and every word is searchable from the Brain." onSave={(v) => save({ body: v })} className="[&_textarea]:min-h-[60vh] [&_textarea]:leading-relaxed" />
      </div>
      <div className="space-y-4">
        <div className="card space-y-3 p-4">
          <AutoSelect label="Kind" value={note.kind} options={NOTE_KINDS} onSave={(v) => save({ kind: v })} />
          <TagsField label="Tags" value={note.tags} onSave={(v) => save({ tags: v })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="!w-auto" defaultChecked={note.pinned} onChange={(e) => void save({ pinned: e.target.checked })} /> Pinned
          </label>
        </div>
        <div className="card space-y-3 p-4">
          <div className="overline">About</div>
          <div className="text-sm">
            {note.relationship ? <span>Person: <a href={`/hq/people/${note.relationship.id}`} className="font-medium hover:text-accent">{note.relationship.name}</a> <button className="text-xs text-faint hover:text-[#8a3a30]" onClick={() => void save({ relationshipId: null })}>×</button></span> : <PersonPicker placeholder="Link a person…" onPick={(p) => { if (p.relationshipId) void save({ relationshipId: p.relationshipId }); }} />}
          </div>
          <div className="text-sm">
            {note.pipeline ? <span>Card: <a href={`/hq/pipeline/${note.pipeline.id}`} className="font-medium hover:text-accent">{note.pipeline.title}</a> <button className="text-xs text-faint hover:text-[#8a3a30]" onClick={() => void save({ pipelineId: null })}>×</button></span> : <CardPicker placeholder="Link a pipeline card…" onPick={(c) => void save({ pipelineId: c.id })} />}
          </div>
        </div>
        <button className="text-xs text-faint hover:text-[#8a3a30]" disabled={pending} onClick={() => { if (confirm("Delete this note?")) start(async () => { await deleteNote(note.id); router.push("/hq/brain"); }); }}>Delete note</button>
      </div>
    </div>
  );
}

export function NewNoteButton({ kind = "note", label = "+ New note" }: { kind?: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => start(async () => { const r = await saveNote({ title: "Untitled", kind, body: "" }); if (r.ok) router.push(`/hq/brain/${r.id}`); })}>{label}</button>
  );
}
