import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, hasRole } from "@/lib/auth";
import { describeOp } from "@/lib/ingest/describe";
import { RECORD_REGISTRY, type IngestTargetType } from "@/lib/ingest/registry";
import { labelFor } from "@/lib/taxonomy";
import type { ProposedOp } from "@/lib/ingest/ops";

// The proposals an item produced, in a shape a page can show as before → after.
// The one-line summary is enough to nod at a small change; a rewrite of a
// page's description needs the reader to see what is going, not just what is
// coming, or approving it is an act of faith.

/** A value as the reader would say it — vocab codes become their labels. */
function readable(targetType: string | null, field: string | undefined, value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if ("text" in o) return String(o.text ?? "");
    if ("reason" in o) return String(o.reason ?? "");
    if ("a" in o && "b" in o) return [o.a, "→", o.b, o.role ? `(${labelFor(String(o.role))})` : ""].filter(Boolean).join(" ");
    return Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(" · ");
  }
  const spec = targetType ? RECORD_REGISTRY[targetType as IngestTargetType] : null;
  const f = spec?.fields.find((x) => x.name === field);
  if (f?.kind === "vocab") return labelFor(String(value)) || String(value);
  return String(value);
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !hasRole(user, "EDITOR")) {
    return NextResponse.json({ error: "Editor access required" }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const item = await db.ingestItem.findUnique({
    where: { id },
    select: { id: true, status: true, relevance: true },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const changes = await db.ingestChange.findMany({
    where: { itemId: id, status: { in: ["pending", "approved", "edited"] } },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true, opType: true, payload: true, confidence: true, sensitive: true,
      destination: true, before: true, after: true, rationale: true,
    },
  });

  return NextResponse.json({
    itemId: item.id,
    status: item.status,
    reasons: ((item.relevance as { reasons?: string[] } | null)?.reasons ?? []).slice(0, 2),
    changes: changes.map((c) => {
      const dest = (c.destination ?? {}) as { targetType?: string; targetId?: string; field?: string; name?: string; path?: string };
      const spec = dest.targetType ? RECORD_REGISTRY[dest.targetType as IngestTargetType] : null;
      const fieldLabel = spec?.fields.find((f) => f.name === dest.field)?.label ?? dest.field ?? null;
      return {
        id: c.id,
        opType: c.opType,
        confidence: c.confidence,
        sensitive: c.sensitive,
        path: dest.path ?? null,
        targetType: dest.targetType ?? null,
        targetId: dest.targetId ?? null,
        targetName: dest.name ?? null,
        field: fieldLabel,
        summary: describeOp(c.payload as unknown as ProposedOp),
        before: readable(dest.targetType ?? null, dest.field, c.before),
        after: readable(dest.targetType ?? null, dest.field, c.after),
        rationale: c.rationale ?? null,
      };
    }),
  });
}
