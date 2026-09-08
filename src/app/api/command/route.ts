import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { searchRepo } from "@/lib/repo-search";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json([], { status: 401 });
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 200) ?? "";
  if (!q) return NextResponse.json([]);
  const { groups } = await searchRepo(q, { previewSize: 3 });
  return NextResponse.json(groups.filter((g) => g.items.length).map((g) => ({ group: g.label, items: g.items.map(({ label, href, sub }) => ({ label, href, sub })) })));
}
