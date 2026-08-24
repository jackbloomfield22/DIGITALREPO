import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, hasRole } from "@/lib/auth";
import { parseIngestItemCore } from "@/lib/ingest/parse";
import { proposeItemCore, triageItemCore } from "@/lib/ingest/pipeline";

// One entry point for the pipeline stages so the duration limit reliably
// applies and the cron + client-side runner share the same path. Apply has
// its own server action (it needs the reviewing user's identity for audit).
export const maxDuration = 60;

const bodySchema = z.object({
  id: z.string().min(1),
  stage: z.enum(["parse", "triage", "propose"]),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || !hasRole(user, "EDITOR")) {
    return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  }
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result =
    body.stage === "parse"
      ? await parseIngestItemCore(body.id)
      : body.stage === "triage"
        ? await triageItemCore(body.id)
        : await proposeItemCore(body.id);

  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
