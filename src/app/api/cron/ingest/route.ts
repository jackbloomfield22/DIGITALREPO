import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseIngestItemCore } from "@/lib/ingest/parse";
import { proposeItemCore, triageItemCore } from "@/lib/ingest/pipeline";
import { ingestAiAvailable } from "@/lib/ingest/ai";

// Safety-net cron: advance items stranded mid-pipeline (e.g. a closed laptop
// stopped the in-browser runner). Budgeted to stay well inside the duration
// limit: parses are cheap, AI stages are capped per run. Vercel Hobby crons
// are daily — the browser runner remains the primary driver.
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const done = { parsed: 0, triaged: 0, proposed: 0 };

  const uploaded = await db.ingestItem.findMany({
    where: { status: "uploaded" },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { id: true },
  });
  for (const item of uploaded) {
    if (await parseIngestItemCore(item.id).then((r) => r.ok)) done.parsed++;
  }

  if (ingestAiAvailable()) {
    const parsed = await db.ingestItem.findMany({
      where: { status: "parsed" },
      orderBy: { createdAt: "asc" },
      take: 2,
      select: { id: true },
    });
    for (const item of parsed) {
      if (await triageItemCore(item.id).then((r) => r.ok)) done.triaged++;
    }
    const triaged = await db.ingestItem.findFirst({
      where: { status: "triaged" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (triaged && (await proposeItemCore(triaged.id)).ok) done.proposed++;
  }

  return NextResponse.json({ ok: true, ...done });
}
