import { NextResponse } from "next/server";
import path from "path";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// Files stored in Postgres (the small-file path). Blob-stored files are
// served from their own signed URLs; see src/lib/files.ts.

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

  const stored = await db.storedFile.findUnique({ where: { key: safe } });
  if (!stored) return new NextResponse("Not found", { status: 404 });
  // Backups keep the file record but not its contents, so a restored
  // database has rows whose recorded size never arrived. Say that, rather
  // than handing over a zero-byte download that looks like a corrupt file.
  if (stored.data.byteLength === 0 && stored.sizeBytes > 0) {
    return new NextResponse(
      "This file's contents weren't included in the backup this database was restored from — the record is here, the file needs re-uploading.",
      { status: 410, headers: { "Content-Type": "text/plain" } },
    );
  }
  const bytes = new Uint8Array(stored.data);
  const type = stored.mimeType ?? MIME[path.extname(safe).toLowerCase()] ?? "application/octet-stream";
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
