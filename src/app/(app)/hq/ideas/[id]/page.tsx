import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/hq/owner";
import { HqFrame } from "@/components/hq/nav";
import { IdeaEditor } from "@/components/hq/ideas";

export const dynamic = "force-dynamic";

export default async function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  const { id } = await params;
  const idea = await db.hqIdea.findFirst({ where: { id, ownerId: user.id } });
  if (!idea) notFound();
  // Looking at it counts as touching it, gently: the resurfacing rotation moves on.
  await db.hqIdea.update({ where: { id }, data: { lastTouchedAt: new Date() } }).catch(() => {});
  return (
    <HqFrame active="/hq/ideas">
      <div className="mb-3 text-xs text-muted"><Link href="/hq/ideas" className="hover:text-accent">← Ideas</Link></div>
      <IdeaEditor idea={{ ...idea, lastTouchedAt: idea.lastTouchedAt.toISOString(), createdAt: idea.createdAt.toISOString() }} />
    </HqFrame>
  );
}
