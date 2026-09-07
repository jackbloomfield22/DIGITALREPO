import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/hq/owner";
import { HqFrame } from "@/components/hq/nav";
import { NoteEditor } from "@/components/hq/note-editor";

export const dynamic = "force-dynamic";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  const { id } = await params;
  const note = await db.hqNote.findFirst({ where: { id, ownerId: user.id }, include: { relationship: { select: { id: true, name: true } }, pipeline: { select: { id: true, title: true } } } });
  if (!note) notFound();
  return (
    <HqFrame active="/hq/brain">
      <div className="mb-3 text-xs text-muted"><Link href="/hq/brain" className="hover:text-accent">← Brain</Link> · {note.kind.replace(/_/g, " ")} · updated {note.updatedAt.toLocaleString()}</div>
      <NoteEditor note={{ id: note.id, title: note.title, body: note.body, kind: note.kind, tags: note.tags, pinned: note.pinned, relationship: note.relationship, pipeline: note.pipeline }} />
    </HqFrame>
  );
}
