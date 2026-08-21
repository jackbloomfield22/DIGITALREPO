import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { DirectoryControls, type DirChip } from "@/components/directory-controls";
import { StatusPill } from "@/components/ui";
import { OPPORTUNITY_STATUSES, OPPORTUNITY_TYPES, labelFor } from "@/lib/taxonomy";
import { formatDate, relativeTime } from "@/lib/format";

export const metadata = { title: "Opportunities" };

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(params.q)?.trim();
  const type = one(params.type);
  const status = one(params.status);

  const and: Prisma.OpportunityWhereInput[] = [{ archived: false }];
  if (q) and.push({ title: { contains: q, mode: "insensitive" } });
  if (type) and.push({ type });
  if (status) and.push({ status });
  const where = { AND: and };

  const [opportunities, total] = await Promise.all([
    db.opportunity.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        owner: { select: { name: true } },
        entityLinks: { include: { entity: { select: { name: true } } } },
        _count: { select: { creators: true, formats: true } },
      },
    }),
    db.opportunity.count({ where }),
  ]);

  const chips: DirChip[] = [
    ...(type ? [{ param: "type", value: type, label: labelFor(type) }] : []),
    ...(status ? [{ param: "status", value: status, label: labelFor(status) }] : []),
  ];

  return (
    <div>
      <DirectoryControls
        title="OPPORTUNITIES"
        total={total}
        createHref="/opportunities/new"
        createLabel="+ Add Opportunity"
        searchPlaceholder="Search opportunities…"
        canEdit={hasRole(user, "EDITOR")}
        chips={chips}
        sorts={[]}
        filters={[
          { param: "type", label: "Type", kind: "select", options: OPPORTUNITY_TYPES },
          { param: "status", label: "Status", kind: "select", options: OPPORTUNITY_STATUSES },
        ]}
      />

      <div className="space-y-3">
        {opportunities.map((o) => (
          <Link key={o.id} href={`/opportunities/${o.slug}`} className="card block p-4 transition-shadow hover:shadow-pop">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-display text-base font-bold">{o.title}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {[labelFor(o.type), o.owner?.name, o.deadline ? `due ${formatDate(o.deadline)}` : null].filter(Boolean).join(" · ")}
                </div>
              </div>
              <StatusPill status={o.status} label={labelFor(o.status)} />
            </div>
            {o.description && <p className="mt-2 line-clamp-2 max-w-3xl text-sm text-charcoal">{o.description}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              {o.entityLinks.length > 0 && <span>{o.entityLinks.map((l) => l.entity.name).join(" · ")}</span>}
              <span className="text-faint">
                {o._count.creators} creators · {o._count.formats} formats · updated {relativeTime(o.updatedAt)}
              </span>
            </div>
          </Link>
        ))}
        {opportunities.length === 0 && (
          <div className="rounded-md border border-dashed border-line-strong bg-wash/50 px-6 py-10 text-center text-sm text-muted">
            No opportunities yet.
          </div>
        )}
      </div>
    </div>
  );
}
