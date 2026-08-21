import { NextResponse } from "next/server";
import { createSnapshot, recentlyBackedUp } from "@/lib/backup";

// Daily automatic backup, invoked by Vercel Cron (see vercel.json).
// If CRON_SECRET is set, the standard Vercel cron Authorization header is
// required; without it the route is still safe — it only writes a snapshot,
// exposes no data, and throttles itself to one scheduled backup per ~20h.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (await recentlyBackedUp()) {
    return NextResponse.json({ ok: true, skipped: "recent backup exists" });
  }

  try {
    const snapshot = await createSnapshot("scheduled");
    return NextResponse.json({ ok: true, id: snapshot.id, sizeBytes: snapshot.sizeBytes });
  } catch (e) {
    console.error("Scheduled backup failed:", e);
    return NextResponse.json({ ok: false, error: "Backup failed" }, { status: 500 });
  }
}
