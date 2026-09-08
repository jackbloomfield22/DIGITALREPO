import { NextResponse } from "next/server";
import { sweepQuietRecords } from "@/lib/quiet";

// Daily: move formats and projects whose two-month timer has run out into
// the Archive. Same guard as the other cron routes.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const out = await sweepQuietRecords();
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    console.error("Quiet sweep failed:", e);
    return NextResponse.json({ ok: false, error: "Sweep failed" }, { status: 500 });
  }
}
