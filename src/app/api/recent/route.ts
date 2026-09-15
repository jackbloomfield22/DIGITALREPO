import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { sidebarLists } from "@/lib/record-refs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json([], { status: 401 });
  const { recents } = await sidebarLists(user.id);
  return NextResponse.json(recents, { headers: { "Cache-Control": "private, no-store" } });
}
