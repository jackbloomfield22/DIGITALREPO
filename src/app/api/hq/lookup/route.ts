import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ownerOrNull } from "@/lib/hq/owner";

// Name lookup for HQ pickers: the owner's relationships first, then people and
// talent in the Repo (which become relationships when chosen), then cards.
export async function GET(request: Request) {
  const user = await ownerOrNull();
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ relationships: [], people: [], creators: [], pipelines: [] });
  const [relationships, people, creators, pipelines] = await Promise.all([
    db.hqRelationship.findMany({ where: { ownerId: user.id, name: { contains: q, mode: "insensitive" } }, take: 8, select: { id: true, name: true, tier: true, personType: true, personId: true } }),
    db.industryPerson.findMany({ where: { archived: false, name: { contains: q, mode: "insensitive" } }, take: 8, select: { id: true, name: true, title: true } }),
    db.creator.findMany({ where: { archived: false, name: { contains: q, mode: "insensitive" } }, take: 8, select: { id: true, name: true, headline: true } }),
    db.hqPipeline.findMany({ where: { ownerId: user.id, title: { contains: q, mode: "insensitive" } }, take: 8, select: { id: true, title: true, stage: true } }),
  ]);
  const known = new Set(relationships.map((r) => `${r.personType}:${r.personId}`));
  return NextResponse.json({
    relationships,
    people: people.filter((p) => !known.has(`person:${p.id}`)),
    creators: creators.filter((c) => !known.has(`creator:${c.id}`)),
    pipelines,
  });
}
