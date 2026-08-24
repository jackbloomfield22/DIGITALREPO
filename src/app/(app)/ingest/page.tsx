import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { ingestAiAvailable } from "@/lib/ingest/ai";
import { UploadZone } from "@/components/ingest/upload-zone";
import { StatusPill } from "@/components/ui";
import { labelFor } from "@/lib/taxonomy";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Ingest" };

const STATUS_FILTERS = ["all", "uploaded", "parsed", "triaged", "proposed", "applied", "irrelevant", "failed"];

type Usage = Record<string, { inputTokens: number; outputTokens: number }> | null;

function tokenTotal(usage: Usage): number {
  if (!usage) return 0;
  return Object.values(usage).reduce((n, u) => n + (u.inputTokens ?? 0) + (u.outputTokens ?? 0), 0);
}

export default async function IngestQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  const { status } = await searchParams;
  const canEdit = hasRole(user, "EDITOR");

  const items = await db.ingestItem.findMany({
    where: status && status !== "all" ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 150,
    include: {
      createdBy: { select: { name: true } },
      parent: { select: { id: true, filename: true } },
      _count: { select: { changes: { where: { status: "pending" } }, children: true } },
    },
  });

  const pendingIds = items
    .filter((i) => ["uploaded", "parsed", "triaged"].includes(i.status))
    .map((i) => i.id);

  const totalTokens = items.reduce((n, i) => n + tokenTotal(i.tokenUsage as Usage), 0);

  // Group email threads together (newest first inside a thread)
  const seenThreads = new Set<string>();
  const rows: { item: (typeof items)[number]; threadCount: number }[] = [];
  for (const item of items) {
    if (item.threadId) {
      if (seenThreads.has(item.threadId)) continue;
      seenThreads.add(item.threadId);
      rows.push({ item, threadCount: items.filter((x) => x.threadId === item.threadId).length });
    } else {
      rows.push({ item, threadCount: 1 });
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">INGEST</h1>
        {totalTokens > 0 && (
          <span className="text-xs text-faint">{(totalTokens / 1000).toFixed(1)}k tokens spent on this queue</span>
        )}
      </div>
      <p className="mb-5 max-w-2xl text-sm text-muted">
        Feed the Repo emails, documents, and notes. Everything becomes reviewable proposals —
        nothing touches the knowledge base until you approve it.
      </p>

      {canEdit && <UploadZone aiAvailable={ingestAiAvailable()} pendingIds={pendingIds} />}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/ingest" : `/ingest?status=${s}`}
            className={`chip ${(status ?? "all") === s ? "bg-wash font-semibold" : ""}`}
          >
            {labelFor(s)}
          </Link>
        ))}
      </div>

      <div className="space-y-1.5">
        {rows.map(({ item, threadCount }) => {
          const meta = item.metadata as { subject?: string; from?: string } | null;
          const title =
            item.kind === "email"
              ? meta?.subject ?? item.filename ?? "Email"
              : item.filename ?? (item.extractedText ? `“${item.extractedText.slice(0, 70)}…”` : "Item");
          const relevance = item.relevance as { score?: number; reasons?: string[] } | null;
          return (
            <Link
              key={item.id}
              href={`/ingest/${item.id}`}
              className="card flex flex-wrap items-center gap-3 px-4 py-2.5 transition-shadow hover:shadow-pop"
            >
              <span className="kind-badge kind-project w-20 shrink-0 text-center">{item.kind}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {title}
                  {threadCount > 1 && <span className="ml-2 text-xs text-muted">({threadCount} in thread)</span>}
                  {item._count.children > 0 && <span className="ml-2 text-xs text-muted">+{item._count.children} files</span>}
                </div>
                <div className="truncate text-xs text-muted">
                  {[
                    item.kind === "email" ? meta?.from : null,
                    item.createdBy?.name,
                    relativeTime(item.createdAt),
                    item.parent ? `from ${item.parent.filename ?? "archive"}` : null,
                    relevance?.score != null ? `relevance ${(relevance.score * 100).toFixed(0)}%` : null,
                    item.error ? `⚠ ${item.error.slice(0, 60)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              {item._count.changes > 0 && (
                <span className="shrink-0 rounded bg-accent-wash px-2 py-0.5 text-xs font-semibold text-accent-deep">
                  {item._count.changes} to review
                </span>
              )}
              <StatusPill status={item.status} label={labelFor(item.status)} />
            </Link>
          );
        })}
        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-faint">
            {status ? "No items with this status." : "Nothing ingested yet — drop a file or paste something above."}
          </p>
        )}
      </div>
    </div>
  );
}
