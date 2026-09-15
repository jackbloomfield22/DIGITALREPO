import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { peekRecord, peekByHref } from "@/lib/peek";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const href = params.get("href");
  const peek = href ? await peekByHref(href) : await peekRecord(params.get("type") ?? "", params.get("id") ?? "");
  if (!peek) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(peek, { headers: { "Cache-Control": "private, no-store" } });
}
