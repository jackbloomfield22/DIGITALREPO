import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { labelFor, PERSON_ROLE_TYPES } from "@/lib/taxonomy";
import { RecordTable } from "@/components/record-table";
import { orderForPeople, parseSort } from "@/lib/directory-sort";

export const metadata = { title: "Industry People" };

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; sort?: string; view?: string }>;
}) {
  await requireUser();
  const { q, role, sort: sortParam, view: viewParam } = await searchParams;
  const sort = parseSort(sortParam, "name");
  const view = viewParam === "cards" ? "cards" : "table";
  const keep = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (role) p.set("role", role);
    if (sortParam) p.set("sort", sortParam);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/people?${p.toString()}`;
  };
  const people = await db.industryPerson.findMany({
    where: {
      archived: false,
      ...(q?.trim() ? { name: { contains: q.trim(), mode: "insensitive" } } : {}),
      ...(role ? { roleType: role } : {}),
    },
    orderBy: orderForPeople(sort) as never,
    take: 200,
    include: {
      organizations: { include: { organization: { select: { name: true, slug: true } } } },
      _count: { select: { creators: true, projects: true } },
    },
  });

  return (
    <div>
      <div className="mb-5 flex items-baseline gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">INDUSTRY PEOPLE</h1>
        <span className="text-sm text-muted">{people.length}</span>
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
    </div>
  );
}
