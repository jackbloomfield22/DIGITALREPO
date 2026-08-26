import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { signedUrlFor } from "@/lib/files";

// Reading a file: check the session, then hand the browser a signed URL good
// for the next hour and get out of the way. The redirect is what makes video
// work — the browser talks range requests directly to Blob's CDN, so scrubbing
// through a two-hour cut costs a few seeks rather than streaming the whole file
// through a serverless function.
//
// Files still held in Postgres from before the move are served the old way.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const attachment = await db.attachment.findUnique({ where: { id } });
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  if (attachment.storage === "blob") {
    const url = await signedUrlFor(attachment.storedPath);
    if (!url) {
      return new NextResponse(
        "This file's storage isn't reachable right now. If it was just uploaded, try again in a moment.",
        { status: 502, headers: { "Content-Type": "text/plain" } },
      );
    }
    // Never cached: the URL inside expires, and a cached redirect would outlive it.
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const stored = await db.storedFile.findUnique({ where: { key: attachment.storedPath } });
  if (!stored) return new NextResponse("Not found", { status: 404 });
  if (stored.data.byteLength === 0 && stored.sizeBytes > 0) {
    return new NextResponse(
      "This file's contents weren't included in the backup this database was restored from — the record is here, the file needs re-uploading.",
      { status: 410, headers: { "Content-Type": "text/plain" } },
    );
  }

  const type = stored.mimeType ?? "application/octet-stream";
  const bytes = new Uint8Array(stored.data);
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.filename)}"`,
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    // Without this a browser will not let you scrub a video at all, however
    // much of it it has already downloaded.
    "Accept-Ranges": "bytes",
  };
  if (type === "image/svg+xml") headers["Content-Security-Policy"] = "sandbox";

  const range = parseRange(request.headers.get("range"), bytes.byteLength);
  if (range === "unsatisfiable") {
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${bytes.byteLength}`, "Accept-Ranges": "bytes" },
    });
  }
  if (range) {
    const slice = bytes.slice(range.start, range.end + 1);
    return new NextResponse(slice.buffer as ArrayBuffer, {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${range.start}-${range.end}/${bytes.byteLength}`,
        "Content-Length": String(slice.byteLength),
      },
    });
  }

  return new NextResponse(bytes.buffer as ArrayBuffer, {
    headers: { ...headers, "Content-Length": String(bytes.byteLength) },
  });
}

/**
 * The single-range form of a Range header, which is all a media element ever
 * sends. Anything else — multiple ranges, a malformed value — is treated as no
 * range at all, which is a legal response and simply returns the whole file.
 */
function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  // "bytes=-500" means the last 500 bytes, not "from 0 to 500".
  let start: number;
  let end: number;
  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (!suffix) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return "unsatisfiable";
  }
  return { start, end };
}
