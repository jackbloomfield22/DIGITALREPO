import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { labelFor, ORG_TYPES } from "@/lib/taxonomy";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Industry" };

// The relationship intelligence layer: every company and industry person the
// Repo knows, and how densely each connects into our world.

export default async function IndustryPage() {
  const user = await requireUser();

  const [orgs, people, recents] = await Promise.all([
    db.organization.findMany({
      where: { archived: false },
      include: { _count: { select: { creators: true, projects: true, people: true } } },
    }),
    db.industryPerson.findMany({
      where: { archived: false },
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: {
        organizations: { include: { organization: { select: { name: true } } }, take: 1 },
        _count: { select: { creators: true } },
      },
    }),
    db.recentView.findMany({
      where: { userId: user.id, targetType: { in: ["organization", "person"] } },
      orderBy: { viewedAt: "desc" },
      take: 8,
    }),
  ]);

  const typeCounts = new Map<string, number>();
  for (const o of orgs) for (const t of o.types) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);

  const connected = [...orgs]
    .sort((a, b) => b._count.creators + b._count.projects + b._count.people - (a._count.creators + a._count.projects + a._count.people))
    .slice(0, 8);

  const recentOrgIds = recents.filter((r) => r.targetType === "organization").map((r) => r.targetId);
  const recentPersonIds = recents.filter((r) => r.targetType === "person").map((r) => r.targetId);
  const [recentOrgs, recentPeople] = await Promise.all([
    recentOrgIds.length
      ? db.organization.findMany({ where: { id: { in: recentOrgIds } }, select: { id: true, name: true, slug: true } })
      : [],
    recentPersonIds.length
      ? db.industryPerson.findMany({ where: { id: { in: recentPersonIds } }, select: { id: true, name: true, slug: true } })
      : [],
  ]);
  const recentChips = recents
    .map((r) =>
      r.targetType === "organization"
        ? recentOrgs.find((o) => o.id === r.targetId) && { href: `/organizations/${recentOrgs.find((o) => o.id === r.targetId)!.slug}`, label: recentOrgs.find((o) => o.id === r.targetId)!.name }
        : recentPeople.find((p) => p.id === r.targetId) && { href: `/people/${recentPeople.find((p) => p.id === r.targetId)!.slug}`, label: recentPeople.find((p) => p.id === r.targetId)!.name },
    )
    .filter((c): c is { href: string; label: string } => !!c);

  return (
    <div className="max-w-4xl">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tight">INDUSTRY</h1>
        <div className="flex gap-2">
          <Link href="/organizations" className="btn btn-secondary btn-sm">All Organizations</Link>
          <Link href="/people" className="btn btn-secondary btn-sm">All People</Link>
        </div>
      </div>
      <p className="mb-8 max-w-2xl text-sm text-muted">
        The relationship layer — production companies, networks, brands, agencies, and the
        agents, managers, and executives inside them, mapped to our talent and projects.
      </p>

      {recentChips.length > 0 && (
        <section className="mb-8">
          <div className="overline mb-2">Recently Viewed</div>
          <div className="flex flex-wrap gap-1.5">
            {recentChips.map((c) => (
              <Link key={c.href} href={c.href} className="chip hover:text-accent-deep">{c.label}</Link>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <div className="overline mb-2">Organizations by Type</div>
        <div className="flex flex-wrap gap-1.5">
          {ORG_TYPES.filter((t) => (typeCounts.get(t.value) ?? 0) > 0).map((t) => (
            <Link key={t.value} href={`/organizations?type=${t.value}`} className="chip hover:text-accent-deep">
              {t.label} <span className="text-xs text-muted">{typeCounts.get(t.value)}</span>
            </Link>
          ))}
          {orgs.length === 0 && <p className="text-sm text-faint">No organizations yet.</p>}
        </div>
      </section>

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <section>
          <div className="overline mb-2">Most Connected Companies</div>
          <div className="space-y-1.5">
            {connected.map((o) => (
              <Link key={o.id} href={`/organizations/${o.slug}`} className="card flex items-baseline justify-between gap-3 px-3.5 py-2.5 transition-shadow hover:shadow-pop">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{o.name}</span>
                  <span className="block truncate text-xs text-muted">{o.types.map((t) => labelFor(t)).join(", ")}</span>
                </span>
                <span className="shrink-0 text-xs text-faint">
                  {o._count.creators + o._count.projects + o._count.people} links
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <div className="overline mb-2">Recently Updated People</div>
          <div className="space-y-1.5">
            {people.map((p) => (
              <Link key={p.id} href={`/people/${p.slug}`} className="card flex items-baseline justify-between gap-3 px-3.5 py-2.5 transition-shadow hover:shadow-pop">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{p.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {[labelFor(p.roleType), p.organizations[0]?.organization.name, p._count.creators ? `${p._count.creators} talent` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-faint">{relativeTime(p.updatedAt)}</span>
              </Link>
            ))}
            {people.length === 0 && <p className="text-sm text-faint">No industry people yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
