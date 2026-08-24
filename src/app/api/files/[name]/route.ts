import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// Legacy location for files uploaded before storage moved into Postgres.
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".pdf": "application/pdf", ".csv": "text/csv", ".txt": "text/plain",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { name } = await params;
  const safe = path.basename(name);

  let bytes: Uint8Array | null = null;
  let type: string | null = null;
  const stored = await db.storedFile.findUnique({ where: { key: safe } });
  if (stored) {
    bytes = new Uint8Array(stored.data);
    type = stored.mimeType;
  } else {
    try {
      bytes = new Uint8Array(await readFile(path.join(UPLOAD_DIR, safe)));
    } catch {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  type = type ?? MIME[path.extname(safe).toLowerCase()] ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
  };
  // SVG can carry scripts; a sandboxed document policy lets it render as an
  // image everywhere while blocking script execution on direct navigation.
  if (type === "image/svg+xml") headers["Content-Security-Policy"] = "sandbox";

  return new NextResponse(new Uint8Array(bytes).buffer as ArrayBuffer, { headers });
}
