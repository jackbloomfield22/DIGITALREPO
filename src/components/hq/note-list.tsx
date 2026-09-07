"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveNote } from "@/lib/actions/hq";

export function NoteList({ notes, newDefaults }: { notes: { id: string; title: string; kind: string; updatedAt: string }[]; newDefaults?: { pipelineId?: string; relationshipId?: string; title?: string; kind?: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div>
      {notes.length === 0 && <div className="text-sm text-faint">No notes yet.</div>}
      <ul className="divide-y divide-line text-sm">
        {notes.map((n) => (
          <li key={n.id} className="py-1.5">
            <Link href={`/hq/brain/${n.id}`} className="font-medium hover:text-accent">{n.title}</Link>
            <span className="ml-2 text-xs text-faint">{n.kind.replace(/_/g, " ")} · {new Date(n.updatedAt).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
      {newDefaults && (
        <button
          className="mt-2 text-xs text-muted hover:text-accent"
          disabled={pending}
          onClick={() => start(async () => {
            const r = await saveNote({ title: newDefaults.title ?? "New note", kind: newDefaults.kind ?? "note", pipelineId: newDefaults.pipelineId, relationshipId: newDefaults.relationshipId, body: "" });
            if (r.ok) router.push(`/hq/brain/${r.id}`);
          })}
        >
          + New note here
        </button>
      )}
    </div>
  );
}
