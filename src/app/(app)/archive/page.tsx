import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { RestoreButton } from "@/components/admin/merge-restore";
import { Section } from "@/components/ui";
import { RECORD_REGISTRY, type IngestTargetType } from "@/lib/ingest/registry";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Archive" };

// Archived records never leave the database — this is their home: what was
// archived, why, by whom, from which source, and one-click Restore.

const TYPES: { targetType: IngestTargetType; title: string }[] = [
  { targetType: "creator", title: "Talent" },
  { targetType: "project", title: "Projects" },
  { targetType: "organization", title: "Organizations" },
  { targetType: "format", title: "Formats" },
  { targetType: "opportunity", title: "Opportunities" },
  { targetType: "person", title: "Industry People" },
];

type ArchivedRow = {
  id: string;
  name: string;
  slug: string;
  archivedReason: string | null;
  archivedAt: Date | null;
};

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q } = await searchParams;
  const isAdmin = hasRole(user, "ADMIN");
  const query = q?.trim();

  const groups = await Promise.all(
    TYPES.map(async ({ targetType, title }) => {
      const spec = RECORD_REGISTRY[targetType];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: Record<string, unknown>[] = await (db as any)[spec.prismaModel].findMany({
        where: {
          archived: true,
          ...(query ? { [spec.nameField]: { contains: query, mode: "insensitive" } } : {}),
        },
        orderBy: { archivedAt: "desc" },
        take: 100,
      });
      const items: ArchivedRow[] = rows.map((r) => ({
        id: r.id as string,
        name: (r[spec.nameField] as string) ?? "?",
        slug: (r.slug as string) ?? "",
        archivedReason: (r.archivedReason as string | null) ?? null,
        archivedAt: (r.archivedAt as Date | null) ?? null,
      }));
      // Who archived + ingest source, from the audit trail
      const audits = items.length
        ? await db.auditLog.findMany({
            where: { targetType, targetId: { in: items.map((i) => i.id) }, action: "archived" },
            orderBy: { createdAt: "desc" },
          })
        : [];
      const auditFor = new Map<string, (typeof audits)[number]>();
      for (const a of audits) if (!auditFor.has(a.targetId)) auditFor.set(a.targetId, a);
      return { targetType, title, items, auditFor };
    }),
  );

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="max-w-3xl">
      <div className="mb-1 flex items-baseline gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">ARCHIVE</h1>
        <span className="text-sm text-muted">{total}</span>
      </div>
      <p className="mb-5 max-w-2xl text-sm text-muted">
        Archived records are hidden from directories and search but never deleted. Restore
        puts one straight back.
      </p>

      <form className="mb-6 max-w-xs">
        <input type="search" name="q" placeholder="Search archived records…" defaultValue={query ?? ""} aria-label="Search archive" />
      </form>

      {total === 0 && (
        <p className="text-sm text-faint">{query ? "No archived records match." : "Nothing is archived."}</p>
      )}

      {groups.map(({ targetType, title, items, auditFor }) => {
        if (!items.length) return null;
        return (
          <Section key={targetType} title={title}>
            <div className="space-y-1.5">
              {items.map((item) => {
                const audit = auditFor.get(item.id);
                const ingestMatch = audit?.field?.match(/ingest (\w+)/);
                return (
                  <div key={item.id} className="card flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{item.name}</div>
                      <div className="text-xs text-muted">
                        {[
                          item.archivedReason,
                          audit?.userName ? `by ${audit.userName}` : null,
                          item.archivedAt ? formatDate(item.archivedAt) : audit ? formatDate(audit.createdAt) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "No reason recorded"}
                        {ingestMatch && (
                          <>
                            {" · "}
                            <Link href={`/ingest/${ingestMatch[1]}`} className="underline underline-offset-2 hover:text-accent">
                              source document
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                    {isAdmin ? (
                      <RestoreButton targetType={targetType as "creator"} targetId={item.id} label={item.name} />
                    ) : (
                      <span className="text-xs text-faint">Admin can restore</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        );
      })}
    </div>
  );
}
