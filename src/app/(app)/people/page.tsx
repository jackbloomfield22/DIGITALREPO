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
  searchParams: Promise<{ q?: string; role?: string; sort?: string; view?: string; page?: string }>;
}) {
  const user = await requireUser();
  const { q, role, sort: sortParam, view: viewParam, page: pageParam } = await searchParams;
  const sort = parseSort(sortParam, "name");
  const view = viewParam === "cards" ? "cards" : "table";
  const page = Math.max(1, Number(pageParam ?? 1) || 1);
  const canEdit = hasRole(user, "EDITOR");
  const keep = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (role) p.set("role", role);
    if (sortParam) p.set("sort", sortParam);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/people?${p.toString()}`;
  };

  const where: Prisma.IndustryPersonWhereInput = {
    archived: false,
    ...(q?.trim() ? { name: { contains: q.trim(), mode: "insensitive" } } : {}),
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

  return (
    <div>
      <div className="mb-5 flex items-baseline gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">INDUSTRY PEOPLE</h1>
        <span className="text-sm text-muted">{total}</span>
      </div>
      <form className="mb-3 max-w-xs">
        <input type="search" name="q" placeholder="Search people…" defaultValue={q ?? ""} aria-label="Search people" />
        {role && <input type="hidden" name="role" value={role} />}
      </form>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {PERSON_ROLE_TYPES.map((r) => (
          <Link
            key={r.value}
            href={r.value === role ? "/people" : `/people?role=${r.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`chip ${r.value === role ? "bg-wash font-semibold" : "text-muted hover:text-accent-deep"}`}
          >
            {r.label}
          </Link>
        ))}
        <span className="ml-auto flex gap-1">
          <Link href={keep({ view: "table" })} className={`chip ${view === "table" ? "bg-wash font-semibold" : "text-muted"}`}>
            List
          </Link>
          <Link href={keep({ view: "cards" })} className={`chip ${view === "cards" ? "bg-wash font-semibold" : "text-muted"}`}>
            Cards
          </Link>
        </span>
      </div>
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
