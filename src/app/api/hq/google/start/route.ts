import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { ownerOrNull } from "@/lib/hq/owner";
import { googleAuthUrl, googleConfigured } from "@/lib/hq/google";

// Step one of connecting Google: send the owner to consent. The state value
// comes back on the callback and is checked against this cookie.
export async function GET(request: Request) {
  const user = await ownerOrNull();
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!googleConfigured()) return NextResponse.redirect(new URL("/hq/settings?google=unconfigured", request.url));
  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set("hq_google_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return NextResponse.redirect(googleAuthUrl(new URL(request.url).origin, state));
}
