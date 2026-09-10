import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signedUrlFor } from "@/lib/files";
import { verifyFetchSignature } from "@/lib/airtable/fetch-url";

// The one way to read a file without a session: a link signed by the server
// for a single attachment, good for under an hour. Airtable uses it to pull
// files that are too big to send directly. Everything else about reading a
// file (the session check, the signed redirect) is unchanged.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  if (!verifyFetchSignature(id, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
    return new NextResponse("This link has expired.", { status: 403 });
  }
  const attachment = await db.attachment.findUnique({ where: { id } });
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  if (attachment.storage === "blob") {
    const signed = await signedUrlFor(attachment.storedPath);
    if (!signed) return new NextResponse("Storage unreachable", { status: 502 });
    return NextResponse.redirect(signed, { status: 302, headers: { "Cache-Control": "private, no-store" } });
  }
  const stored = await db.storedFile.findUnique({ where: { key: attachment.storedPath } });
  if (!stored || (stored.data.byteLength === 0 && stored.sizeBytes > 0)) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(stored.data).buffer as ArrayBuffer, {
    headers: {
      "Content-Type": stored.mimeType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
