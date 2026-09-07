import { NextResponse } from "next/server";
import { ownerOrNull } from "@/lib/hq/owner";
import { buildBrief } from "@/lib/hq/studio";

export async function GET(request: Request) {
  const user = await ownerOrNull();
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const p = new URL(request.url).searchParams;
  const brief = await buildBrief(user.id, { output: p.get("output") ?? "logline", pipelineId: p.get("pipelineId") || null, relationshipId: p.get("relationshipId") || null, extra: (p.get("extra") ?? "").slice(0, 4000) });
  return NextResponse.json({ brief });
}
