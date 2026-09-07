import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerOrNull } from "@/lib/hq/owner";
import { askBrain } from "@/lib/hq/ask";

export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await ownerOrNull();
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = z.object({
    question: z.string().trim().min(1).max(4000),
    history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).max(12).optional(),
  }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const out = await askBrain(user.id, body.data.question, body.data.history ?? []);
  return NextResponse.json(out, { status: out.ok ? 200 : 422 });
}
