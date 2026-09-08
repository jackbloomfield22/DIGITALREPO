import { redirect } from "next/navigation";
import { directoryPageUrl } from "@/lib/directory-params";
import { DirectoryControls, type DirChip } from "@/components/directory-controls";
import { personSearch } from "@/lib/search-where";
import { firstParam, type SearchParams } from "@/lib/directory-params";
import { pageNumber } from "@/lib/directory-params";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { labelFor, PERSON_ROLE_TYPES } from "@/lib/taxonomy";
import { RecordTable } from "@/components/record-table";
import { RowArchive } from "@/components/row-status";
import { Pagination } from "@/components/pagination";
import { orderForPeople, parseSort } from "@/lib/directory-sort";

export const metadata = { title: "Industry People" };

const PAGE_SIZE = 50;

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const q = firstParam(params.q)?.trim();
  const role = firstParam(params.role);
  const org = firstParam(params.org);
  const sortParam = firstParam(params.sort);
  const viewParam = firstParam(params.view);
  const pageParam = firstParam(params.page);
  const sort = parseSort(sortParam, "name");
  const view = viewParam === "cards" ? "cards" : "table";
  const page = pageNumber(pageParam);
  const canEdit = hasRole(user, "EDITOR");
  const where: Prisma.IndustryPersonWhereInput = {
    archived: false,
    ...(q ? personSearch(q) : {}),
    ...(org ? { organizations: { some: { organizationId: org } } } : {}),
    ...(role ? { roleType: role } : {}),
  };

  const [people, total] = await Promise.all([
    db.industryPerson.findMany({
      where,
      orderBy: orderForPeople(sort) as never,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        organizations: { include: { organization: { select: { name: true, slug: true } } } },
        _count: { select: { creators: true, projects: true } },
      },
    }),
    db.industryPerson.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pages) redirect(directoryPageUrl("/people", params, pages));

  const organization = org ? await db.organization.findUnique({ where: { id: org }, select: { name: true } }) : null;
  const chips: DirChip[] = [
    ...(role ? [{ param: "role", value: role, label: labelFor(role) }] : []),
    ...(org ? [{ param: "org", value: org, label: organization?.name ?? "Organization" }] : []),
  ];
  return (
    <div>
      <DirectoryControls title="Industry people" total={total} createHref="/people/new" createLabel="+ Add person" searchPlaceholder="Search names, roles, companies, email…" canEdit={canEdit} viewToggle savedViewType="people" chips={chips} sorts={[
        { value: "name", label: "Alphabetical" }, { value: "title", label: "Job title" }, { value: "role", label: "Role" }, { value: "updated-desc", label: "Recently updated" },
      ]} filters={[
        { param: "role", label: "Role", kind: "select", options: PERSON_ROLE_TYPES },
        { param: "org", label: "Organization", kind: "lookup", lookupType: "organization" },
      ]} />
      {view === "table" ? (
        <RecordTable
          sort={sort}
          empty="No people match."
          columns={[
            { label: "Name", sortKey: "name" },
            { label: "Title", sortKey: "title" },
            { label: "Role", sortKey: "role", showAt: "hidden sm:table-cell" },
            { label: "Organization", showAt: "hidden md:table-cell" },
            { label: "Email", showAt: "hidden lg:table-cell" },
            { label: "Projects", align: "right", showAt: "hidden md:table-cell" },
            { label: "", align: "right" },
          ]}
          rows={people.map((p) => ({
            id: p.id,
            href: `/people/${p.slug}`,
            cells: [
              <span key="n">{p.name}</span>,
              <span key="t" className="line-clamp-1 text-muted">{p.title ?? <span className="text-faint">—</span>}</span>,
              <span key="r" className="text-muted">{labelFor(p.roleType) || <span className="text-faint">—</span>}</span>,
              <span key="o" className="line-clamp-1 text-muted">
                {p.organizations.map((x) => x.organization.name).join(", ") || <span className="text-faint">—</span>}
              </span>,
              <span key="e" className="line-clamp-1 text-muted">{p.email ?? <span className="text-faint">—</span>}</span>,
              <span key="p" className="tabular-nums text-muted">{p._count.projects || <span className="text-faint">—</span>}</span>,
              <RowArchive key="a" type="person" id={p.id} name={p.name} canEdit={canEdit} />,
            ],
          }))}
        />
      ) : (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {people.map((p) => (
          <Link key={p.id} href={`/people/${p.slug}`} className="card block p-4 transition-shadow hover:shadow-pop">
            <div className="font-semibold">{p.name}</div>
            <div className="text-xs text-muted">
              {[p.title, labelFor(p.roleType)].filter(Boolean).join(" · ")}
            </div>
            {p.organizations[0] && (
              <div className="mt-1 text-xs text-muted">{p.organizations[0].organization.name}</div>
            )}
            <div className="mt-1.5 text-xs text-faint">
              {p._count.creators} creators · {p._count.projects} projects
            </div>
          </Link>
        ))}
        {people.length === 0 && <p className="text-sm text-faint">No people match.</p>}
      </div>
      )}

      <Pagination page={page} pages={pages} />
    </div>
  );
}
