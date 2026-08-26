import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSessionUser, hasRole } from "@/lib/auth";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, blobConfigured } from "@/lib/files";

// Issues the short-lived token a browser needs to upload straight to Blob
// storage. The file never passes through this function — a serverless request
// body stops at 4.5MB, and the point of this route is files far bigger than
// that. What the function does control is who gets a token and what that token
// will accept: an editor session, a known content type, and a size ceiling,
// all enforced by the storage service rather than by trust in the client.
export async function POST(request: Request): Promise<NextResponse> {
  if (!blobConfigured()) {
    return NextResponse.json(
      { error: "File storage isn't connected yet — an admin needs to add a Blob store in Vercel." },
      { status: 503 },
    );
  }

  const user = await getSessionUser();
  if (!user || !hasRole(user, "EDITOR")) {
    return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  }

  try {
    const result = await handleUpload({
      request,
      body: (await request.json()) as HandleUploadBody,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_UPLOAD_TYPES,
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        // Two people attaching "cut_v3.mp4" on the same day must not collide,
        // and a guessed pathname must not resolve to someone else's file.
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ userId: user.id }),
      }),
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload could not start." },
      { status: 400 },
    );
  }
}
