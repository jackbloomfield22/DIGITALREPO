import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { ReviewBoard, type ChangeVM, type ItemVM } from "@/components/ingest/review-board";
import { labelFor } from "@/lib/taxonomy";
import { StatusPill } from "@/components/ui";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Review Ingest" };

export default async function IngestItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const item = await db.ingestItem.findUnique({
    where: { id },
    include: {
      changes: { orderBy: { sortOrder: "asc" } },
      children: { select: { id: true, filename: true, status: true } },
      parent: { select: { id: true, filename: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!item) notFound();

  const canEdit = hasRole(user, "EDITOR");
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const relevance = item.relevance as { score?: number; reasons?: string[] } | null;

  // Sibling thread items for context
  const thread = item.threadId
    ? await db.ingestItem.findMany({
        where: { threadId: item.threadId, id: { not: item.id } },
        select: { id: true, status: true, metadata: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const itemVM: ItemVM = {
    id: item.id,
    kind: item.kind,
    status: item.status,
    filename: item.filename,
    text: item.extractedText ?? "",
    strippedText: (meta.strippedText as string) ?? null,
    headers:
      item.kind === "email"
        ? {
            from: (meta.from as string) ?? "",
            to: ((meta.to as string[]) ?? []).join(", "),
            cc: ((meta.cc as string[]) ?? []).join(", "),
            date: (meta.date as string) ?? "",
            subject: (meta.subject as string) ?? "",
          }
        : null,
    error: item.error,
    relevance: relevance ? { score: relevance.score ?? null, reasons: relevance.reasons ?? [] } : null,
    proposeInfo: (meta.proposeInfo as ItemVM["proposeInfo"]) ?? null,
  };

  const changes: ChangeVM[] = item.changes.map((c) => ({
    id: c.id,
    group: c.group,
    opType: c.opType,
    destinationPath: (c.destination as { path?: string | null }).path ?? null,
    destinationName: (c.destination as { name?: string }).name ?? "",
    field: (c.destination as { field?: string }).field ?? null,
    before: c.before != null ? String(c.before) : null,
    after: c.after,
    editedValue: (c.editedAfter as { value?: string } | null)?.value ?? null,
    confidence: c.confidence,
    rationale: c.rationale,
    evidence: (c.evidence as { snippet: string; start: number; end: number }[] | null) ?? [],
    sensitive: c.sensitive,
    status: c.status,
    error: c.error,
  }));

  return (
    <div>
      <div className="mb-5">
        <Link href="/ingest" className="text-sm text-muted hover:text-accent">← Ingest queue</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          <h1 className="min-w-0 truncate font-display text-2xl font-bold tracking-tight">
            {itemVM.headers?.subject || item.filename || "Pasted text"}
          </h1>
          <StatusPill status={item.status} label={labelFor(item.status)} />
        </div>
        <div className="mt-1 text-xs text-muted">
          {[
            item.createdBy?.name,
            relativeTime(item.createdAt),
            item.parent ? `unpacked from ${item.parent.filename ?? "archive"}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {(thread.length > 0 || item.children.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {thread.map((t) => (
              <Link key={t.id} href={`/ingest/${t.id}`} className="chip">
                Thread: {((t.metadata as { subject?: string } | null)?.subject ?? "message").slice(0, 40)}
                <span className="text-faint">{labelFor(t.status)}</span>
              </Link>
            ))}
            {item.children.map((child) => (
              <Link key={child.id} href={`/ingest/${child.id}`} className="chip">
                📎 {child.filename ?? "attachment"}
                <span className="text-faint">{labelFor(child.status)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <ReviewBoard item={itemVM} changes={changes} canEdit={canEdit} />
    </div>
  );
}
