import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerOrNull } from "@/lib/hq/owner";
import { draftWithStyle } from "@/lib/hq/ask";

export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await ownerOrNull();
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = z.object({ brief: z.string().trim().min(20).max(60_000) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const out = await draftWithStyle(user.id, body.data.brief);
  return NextResponse.json(out, { status: out.ok ? 200 : 422 });
}
