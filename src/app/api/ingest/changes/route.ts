import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasRole } from "@/lib/auth";
import { describeOp } from "@/lib/ingest/describe";
import type { ProposedOp } from "@/lib/ingest/ops";

// The proposals an item produced, in one line each. Used by the note box, which
// shows what it understood before it changes anything.
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !hasRole(user, "EDITOR")) {
    return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const item = await db.ingestItem.findUnique({
    where: { id },
    select: { id: true, status: true, relevance: true },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const changes = await db.ingestChange.findMany({
    where: { itemId: id, status: { in: ["pending", "approved", "edited"] } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, opType: true, payload: true, confidence: true, sensitive: true, destination: true },
  });

  return NextResponse.json({
    itemId: item.id,
    status: item.status,
    reasons: ((item.relevance as { reasons?: string[] } | null)?.reasons ?? []).slice(0, 2),
    changes: changes.map((c) => ({
      id: c.id,
      opType: c.opType,
      confidence: c.confidence,
      sensitive: c.sensitive,
      path: (c.destination as { path?: string } | null)?.path ?? null,
      summary: describeOp(c.payload as unknown as ProposedOp),
    })),
  });
}
