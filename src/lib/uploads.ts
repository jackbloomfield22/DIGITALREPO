import "server-only";

import { db } from "@/lib/db";
import { IMPORT_RECORD_NOTE } from "@/lib/drive-import";

// Everything that puts information into the Repo, in one shape. Three routes
// exist — reviewed ingest, talent spreadsheets, knowledge bundles — and they
// used to be three unrelated screens with three different mental models. This
// gives them one history, one vocabulary, and one way to take something back
// out.

export type SubmissionKind = "ingest" | "bundle";

export type Submission = {
  id: string;
  kind: SubmissionKind;
  title: string;
  detail: string;
  state: "needs-review" | "in-repo" | "working" | "nothing-found" | "problem";
  stateLabel: string;
  createdAt: string;
  href: string | null;
  canRetry: boolean;
  canUndo: boolean;
};

const INGEST_STATE: Record<string, { state: Submission["state"]; label: string }> = {
  uploaded: { state: "working", label: "Reading" },
  parsed: { state: "working", label: "Reading" },
  triaged: { state: "working", label: "Working out what matters" },
  proposed: { state: "needs-review", label: "Ready for you to review" },
  applied: { state: "in-repo", label: "In the Repo" },
  irrelevant: { state: "nothing-found", label: "Nothing worth keeping" },
  failed: { state: "problem", label: "Didn't work" },
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function ingestTitle(item: {
  kind: string;
  filename: string | null;
  metadata: unknown;
}): string {
  if (item.kind === "email") {
    const subject = (item.metadata as { subject?: string } | null)?.subject;
    return subject ? `Email: ${subject}` : "Email";
  }
  return item.filename ?? "Pasted text";
}

/** Everything submitted, newest first. */
export async function listSubmissions(limit = 60): Promise<Submission[]> {
  const [items, links] = await Promise.all([
    db.ingestItem.findMany({
      where: { parentId: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, kind: true, filename: true, metadata: true, status: true,
        createdAt: true, error: true,
        _count: { select: { changes: true, children: true } },
      },
    }),
    db.recordSource.findMany({
      where: { note: IMPORT_RECORD_NOTE },
      select: { sourceId: true, targetType: true },
    }),
  ]);

  const submissions: Submission[] = items.map((item) => {
    const map = INGEST_STATE[item.status] ?? { state: "working" as const, label: item.status };
    const bits: string[] = [];
    if (item._count.children) bits.push(plural(item._count.children, "file"));
    if (item.status === "proposed" && item._count.changes) bits.push(`${plural(item._count.changes, "change")} suggested`);
    if (item.status === "applied" && item._count.changes) bits.push(`${plural(item._count.changes, "change")} made`);
    if (item.status === "failed" && item.error) bits.push(item.error.slice(0, 80));
    return {
      id: item.id,
      kind: "ingest" as const,
      title: ingestTitle(item),
      detail: bits.join(" · ") || "Nothing proposed yet",
      state: map.state,
      stateLabel: map.label,
      createdAt: item.createdAt.toISOString(),
      href: `/ingest/${item.id}`,
      canRetry: item.status !== "applied",
      canUndo: item.status === "applied",
    };
  });

  // Bulk uploads, assembled from the records each one created.
  if (links.length) {
    const bySource = new Map<string, Map<string, number>>();
    for (const l of links) {
      if (!bySource.has(l.sourceId)) bySource.set(l.sourceId, new Map());
      const m = bySource.get(l.sourceId)!;
      m.set(l.targetType, (m.get(l.targetType) ?? 0) + 1);
    }
    const sources = await db.source.findMany({
      where: { id: { in: [...bySource.keys()] } },
      select: { id: true, title: true, createdAt: true },
    });
    const LABELS: Record<string, string> = {
      organization: "organizations", person: "industry people", creator: "talent",
      project: "projects", format: "formats", opportunity: "opportunities",
    };
    for (const s of sources) {
      const m = bySource.get(s.id)!;
      const parts = [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([type, n]) => `${n} ${LABELS[type] ?? type}`);
      submissions.push({
        id: s.id,
        kind: "bundle",
        title: s.title ?? "Knowledge bundle",
        detail: parts.join(" · "),
        state: "in-repo",
        stateLabel: "In the Repo",
        createdAt: s.createdAt.toISOString(),
        href: null,
        canRetry: false,
        canUndo: true,
      });
    }
  }

  return submissions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}
