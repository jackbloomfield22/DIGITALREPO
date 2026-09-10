import { NextResponse } from "next/server";
import { drainAirtableQueue, queueEverything } from "@/lib/airtable/sync";
import { airtableReady } from "@/lib/airtable/config";

// Daily: put every format and project back on the queue and work through it.
// Unchanged records cost nothing (their row hash matches), so this is a
// safety net for anything a request-time push missed, not a full re-upload.
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await airtableReady())) return NextResponse.json({ ok: true, skipped: "Airtable is not set up" });
  try {
    const queued = await queueEverything();
    const started = Date.now();
    let synced = 0, failed = 0, remaining = 0;
    // Batches until the queue is empty or the budget is nearly spent.
    do {
      const out = await drainAirtableQueue({ limit: 40 });
      synced += out.synced; failed += out.failed; remaining = out.remaining;
      if (out.synced + out.failed + out.skipped === 0) break;
    } while (remaining > 0 && Date.now() - started < 240_000);
    return NextResponse.json({ ok: true, queued, synced, failed, remaining });
  } catch (e) {
    console.error("Airtable cron failed:", e);
    return NextResponse.json({ ok: false, error: "Sync failed" }, { status: 500 });
  }
}
