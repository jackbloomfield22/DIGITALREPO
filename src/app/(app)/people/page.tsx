import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { labelFor, PERSON_ROLE_TYPES } from "@/lib/taxonomy";

export const metadata = { title: "Industry People" };

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string }>;
}) {
  await requireUser();
  const { q, role } = await searchParams;
  const people = await db.industryPerson.findMany({
    where: {
      archived: false,
      ...(q?.trim() ? { name: { contains: q.trim(), mode: "insensitive" } } : {}),
      ...(role ? { roleType: role } : {}),
    },
    orderBy: { name: "asc" },
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
      <div className="mb-4 flex flex-wrap gap-1.5">
        {PERSON_ROLE_TYPES.map((r) => (
          <Link
            key={r.value}
            href={r.value === role ? "/people" : `/people?role=${r.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`chip ${r.value === role ? "bg-wash font-semibold" : "text-muted hover:text-accent-deep"}`}
          >
            {r.label}
          </Link>
        ))}
      </div>
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
    </div>
  );
}
