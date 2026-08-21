import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasRole } from "@/lib/auth";

// Download a stored backup as a JSON file (admins only).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !hasRole(user, "ADMIN")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { id } = await params;
  const snapshot = await db.snapshot.findUnique({ where: { id } });
  if (!snapshot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const date = snapshot.createdAt.toISOString().slice(0, 19).replace(/[T:]/g, "-");
  return new NextResponse(JSON.stringify(snapshot.data), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="digital-bible-backup-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
