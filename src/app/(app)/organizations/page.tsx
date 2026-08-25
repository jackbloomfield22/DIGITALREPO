import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { DirectoryControls, type DirChip } from "@/components/directory-controls";
import { RecordTable } from "@/components/record-table";
import { orderForOrganizations, parseSort } from "@/lib/directory-sort";
import { Portrait } from "@/components/ui";
import { ORG_TYPES, labelFor } from "@/lib/taxonomy";
import { Pagination } from "@/components/pagination";

export const metadata = { title: "Organizations" };

const PAGE_SIZE = 36;

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(params.q)?.trim();
  const type = one(params.type);
  const sort = parseSort(one(params.sort), "name");
  const view = one(params.view) === "cards" ? "cards" : "table";
  const page = Math.max(1, Number(one(params.page) ?? 1) || 1);

  const and: Prisma.OrganizationWhereInput[] = [{ archived: false }];
  if (q) and.push({ OR: [{ name: { contains: q, mode: "insensitive" } }, { aliases: { hasSome: [q] } }] });
  if (type) and.push({ types: { has: type } });
  const where = { AND: and };

  const [organizations, total] = await Promise.all([
    db.organization.findMany({
      where,
      orderBy: orderForOrganizations(sort) as never,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: { select: { projects: true, creators: true, formats: true, people: true } },
      },
    }),
    db.organization.count({ where }),
  ]);

  const chips: DirChip[] = type ? [{ param: "type", value: type, label: labelFor(type) }] : [];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <DirectoryControls
        title="ORGANIZATIONS"
        total={total}
        createHref="/organizations/new"
        createLabel="+ Add Organization"
        searchPlaceholder="Search organizations…"
        canEdit={hasRole(user, "EDITOR")}
        chips={chips}
        viewToggle
        savedViewType="organizations"
        sorts={[
          { value: "name", label: "Alphabetical" },
          { value: "location", label: "Location" },
          { value: "updated", label: "Recently Updated" },
          { value: "created-desc", label: "Recently Added" },
        ]}
        filters={[{ param: "type", label: "Organization Type", kind: "select", options: ORG_TYPES }]}
      />

      {view === "table" ? (
        <RecordTable
          sort={sort}
          empty="No organizations match."
          columns={[
            { label: "Organization", sortKey: "name" },
            { label: "Types" },
            { label: "Location", sortKey: "location", showAt: "hidden sm:table-cell" },
            { label: "Projects", align: "right", showAt: "hidden md:table-cell" },
            { label: "Formats", align: "right", showAt: "hidden md:table-cell" },
            { label: "People", align: "right", showAt: "hidden lg:table-cell" },
          ]}
          rows={organizations.map((o) => ({
            id: o.id,
            href: `/organizations/${o.slug}`,
            cells: [
              <span key="n">{o.name}</span>,
              <span key="t" className="line-clamp-1 text-muted">{o.types.map(labelFor).join(", ") || "—"}</span>,
              <span key="l" className="text-muted">{o.location ?? <span className="text-faint">—</span>}</span>,
              <span key="p" className="tabular-nums text-muted">{o._count.projects || <span className="text-faint">—</span>}</span>,
              <span key="f" className="tabular-nums text-muted">{o._count.formats || <span className="text-faint">—</span>}</span>,
              <span key="pe" className="tabular-nums text-muted">{o._count.people || <span className="text-faint">—</span>}</span>,
            ],
          }))}
        />
      ) : (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {organizations.map((o) => (
          <Link key={o.id} href={`/organizations/${o.slug}`} className="card flex items-start gap-3 p-4 transition-shadow hover:shadow-pop">
            <Portrait name={o.name} imageUrl={o.imageUrl} className="h-11 w-11 shrink-0 rounded" textClass="text-sm" />
            <div className="min-w-0">
              <div className="truncate font-semibold">{o.name}</div>
              <div className="truncate text-xs text-muted">{o.types.map(labelFor).join(" · ") || "Organization"}</div>
              <div className="mt-1 text-xs text-faint">
                {[
                  o._count.projects ? `${o._count.projects} projects` : null,
                  o._count.creators ? `${o._count.creators} creators` : null,
                  o._count.formats ? `${o._count.formats} formats` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "No links yet"}
              </div>
            </div>
          </Link>
        ))}
      </div>

      )}

      <Pagination page={page} pages={pages} />
    </div>
  );
}
