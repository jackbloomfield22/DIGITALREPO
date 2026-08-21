import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Section } from "@/components/ui";
import { ENTITY_KINDS, ENTITY_KIND_PLURALS, labelFor, type EntityKind } from "@/lib/taxonomy";

export const metadata = { title: "Explore" };

export default async function ExplorePage() {
  await requireUser();

  const [entities, orgs, reps] = await Promise.all([
    db.entity.findMany({
      include: { _count: { select: { creatorLinks: true, projectLinks: true, formatLinks: true } } },
    }),
    db.organization.findMany({
      where: { archived: false },
      include: { _count: { select: { creators: true, projects: true } } },
      orderBy: { name: "asc" },
    }),
    db.industryPerson.findMany({
      where: { archived: false, roleType: { in: ["agent", "manager", "publicist"] } },
      include: { _count: { select: { creators: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const byKind = new Map<string, typeof entities>();
  for (const e of entities) {
    const list = byKind.get(e.kind) ?? [];
    list.push(e);
    byKind.set(e.kind, list);
  }
  for (const list of byKind.values()) {
    list.sort((a, b) => b._count.creatorLinks - a._count.creatorLinks || a.name.localeCompare(b.name));
  }

  const orgGroups: [string, string[]][] = [
    ["Brands", ["brand"]],
    ["Production Companies", ["production_company", "studio"]],
    ["Networks & Platforms", ["network", "streamer", "digital_platform"]],
    ["Agencies & Management", ["agency", "management_company"]],
  ];

  return (
    <div>
      <h1 className="mb-1 font-display text-3xl font-bold tracking-tight">EXPLORE</h1>
      <p className="mb-8 text-sm text-muted">
        Every structured entity is a doorway — click anything to see who and what connects to it.
      </p>

      {ENTITY_KINDS.map((kind) => {
        const list = byKind.get(kind) ?? [];
        if (!list.length) return null;
        return (
          <Section
            key={kind}
            title={ENTITY_KIND_PLURALS[kind as EntityKind]}
            action={
              <Link href={`/explore/${kind}`} className="text-xs text-muted underline underline-offset-2 hover:text-accent">
                View all {list.length} →
              </Link>
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {list.slice(0, 14).map((e) => (
                <Link key={e.id} href={`/explore/${kind}/${e.slug}`} className="chip">
                  {e.name}
                  <span className="text-xs text-faint">{e._count.creatorLinks || ""}</span>
                </Link>
              ))}
            </div>
          </Section>
        );
      })}

      {orgGroups.map(([title, types]) => {
        const list = orgs.filter((o) => o.types.some((t) => types.includes(t)));
        if (!list.length) return null;
        return (
          <Section key={title} title={title} action={
            <Link href="/organizations" className="text-xs text-muted underline underline-offset-2 hover:text-accent">
              All organizations →
            </Link>
          }>
            <div className="flex flex-wrap gap-1.5">
              {list.map((o) => (
                <Link key={o.id} href={`/organizations/${o.slug}`} className="chip">
                  {o.name}
                  <span className="text-xs text-faint">
                    {o._count.creators + o._count.projects || ""}
                  </span>
                </Link>
              ))}
            </div>
          </Section>
        );
      })}

      <Section
        title="Representatives"
        action={
          <Link href="/people" className="text-xs text-muted underline underline-offset-2 hover:text-accent">
            All industry people →
          </Link>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {reps.map((p) => (
            <Link key={p.id} href={`/people/${p.slug}`} className="chip">
              {p.name}
              <span className="text-xs text-faint">
                {labelFor(p.roleType)}{p._count.creators ? ` · ${p._count.creators}` : ""}
              </span>
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
