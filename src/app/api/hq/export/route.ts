import { NextResponse } from "next/server";
import { ownerOrNull } from "@/lib/hq/owner";
import { buildHqExport } from "@/lib/hq/seed";

export async function GET() {
  const user = await ownerOrNull();
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const out = await buildHqExport(user.id);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="hq-export-${stamp}.json"` },
  });
}
