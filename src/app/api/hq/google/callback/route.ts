import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ownerOrNull } from "@/lib/hq/owner";
import { connectGoogle, runGoogleSync } from "@/lib/hq/google";

export const maxDuration = 60;

export async function GET(request: Request) {
  const user = await ownerOrNull();
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(request.url);
  const jar = await cookies();
  const expected = jar.get("hq_google_state")?.value;
  jar.delete("hq_google_state");
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return NextResponse.redirect(new URL(`/hq/settings?google=denied`, url.origin));
  if (!code || !state || state !== expected) return NextResponse.redirect(new URL(`/hq/settings?google=state`, url.origin));
  try {
    await connectGoogle(user.id, code, url.origin);
    await runGoogleSync(user.id);
    return NextResponse.redirect(new URL(`/hq/settings?google=connected`, url.origin));
  } catch (e) {
    const message = e instanceof Error ? e.message : "failed";
    return NextResponse.redirect(new URL(`/hq/settings?google=error&message=${encodeURIComponent(message)}`, url.origin));
  }
}
