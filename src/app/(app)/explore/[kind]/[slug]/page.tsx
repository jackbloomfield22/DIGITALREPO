import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { KindBadge, Portrait, Section, StatusPill } from "@/components/ui";
import { ENTITY_KIND_LABELS, labelFor, type EntityKind } from "@/lib/taxonomy";
import { compactNumber, totalAudience } from "@/lib/format";

// Entity intelligence page: the entity itself becomes a research surface.
export default async function EntityPage({
  params,
}: {
  params: Promise<{ kind: string; slug: string }>;
}) {
  await requireUser();
  const { kind, slug } = await params;
  const entity = await db.entity.findUnique({
    where: { kind_slug: { kind, slug } },
    include: {
      creatorLinks: {
        include: {
          creator: {
            select: {
              id: true, name: true, slug: true, imageUrl: true, headline: true, archived: true,
              socialProfiles: { select: { followerCount: true } },
              entityLinks: {
                select: {
                  relationship: true,
                  entity: { select: { id: true, kind: true, name: true, slug: true } },
                },
              },
              organizations: { select: { organization: { select: { id: true, name: true, slug: true } } } },
            },
          },
        },
      },
      projectLinks: {
        include: { project: { select: { id: true, title: true, slug: true, projectType: true, premiereYear: true, archived: true } } },
      },
      formatLinks: {
        include: { format: { select: { id: true, title: true, slug: true, status: true, archived: true } } },
      },
    },
  });
  if (!entity) notFound();

  const creators = entity.creatorLinks
    .filter((l) => !l.creator.archived)
    .map((l) => l.creator);
  // dedupe (a creator may link twice with different relationships, e.g. locations)
  const uniqueCreators = [...new Map(creators.map((c) => [c.id, c])).values()].sort(
    (a, b) => totalAudience(b.socialProfiles) - totalAudience(a.socialProfiles),
  );
  const projects = entity.projectLinks.filter((l) => !l.project.archived).map((l) => l.project);
  const formats = entity.formatLinks.filter((l) => !l.format.archived).map((l) => l.format);

  // Co-occurrence intelligence across this entity's creators
  const locationCounts = new Map<string, { name: string; slug: string; kind: string; n: number }>();
  const relatedCounts = new Map<string, { name: string; slug: string; kind: string; n: number }>();
  const orgCounts = new Map<string, { name: string; slug: string; n: number }>();
  for (const c of uniqueCreators) {
    for (const l of c.entityLinks) {
      if (l.entity.id === entity.id) continue;
      if (l.entity.kind === "location") {
        if (l.relationship && l.relationship !== "based_in") continue;
        const e = locationCounts.get(l.entity.id) ?? { ...l.entity, n: 0 };
        e.n++;
        locationCounts.set(l.entity.id, e);
      } else if (["interest", "sport", "hobby"].includes(l.entity.kind)) {
        const e = relatedCounts.get(l.entity.id) ?? { ...l.entity, n: 0 };
        e.n++;
        relatedCounts.set(l.entity.id, e);
      }
    }
    for (const o of c.organizations) {
      const e = orgCounts.get(o.organization.id) ?? { ...o.organization, n: 0 };
      e.n++;
      orgCounts.set(o.organization.id, e);
    }
  }
  const top = <T extends { n: number }>(m: Map<string, T>) =>
    [...m.values()].filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 8);
  const commonLocations = top(locationCounts);
  const relatedInterests = top(relatedCounts);
  const commonOrgs = top(orgCounts);

  return (
    <div>
      <div className="mb-8">
        <div className="overline">{ENTITY_KIND_LABELS[entity.kind as EntityKind] ?? labelFor(entity.kind)}</div>
        <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">{entity.name}</h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          <span><strong className="text-ink">{uniqueCreators.length}</strong> Talent</span>
          <span><strong className="text-ink">{projects.length}</strong> Projects</span>
          <span><strong className="text-ink">{formats.length}</strong> Formats</span>
        </div>
        {uniqueCreators.length > 0 && (
          <Link href={`/talent?entity=${entity.id}`} className="btn btn-secondary btn-sm mt-3">
            Open in Creator Directory →
          </Link>
        )}
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Section title="Talent">
            <div className="grid gap-2 sm:grid-cols-2">
              {uniqueCreators.map((c) => (
                <Link key={c.id} href={`/talent/${c.slug}`} className="card flex items-center gap-3 p-3 transition-shadow hover:shadow-pop">
                  <Portrait name={c.name} imageUrl={c.imageUrl} className="h-10 w-10 shrink-0 rounded" textClass="text-xs" />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{c.name}</div>
                    <div className="truncate text-xs text-muted">{c.headline ?? ""}</div>
                  </div>
                  <div className="ml-auto shrink-0 text-xs font-semibold">
                    {compactNumber(totalAudience(c.socialProfiles))}
                  </div>
                </Link>
              ))}
              {uniqueCreators.length === 0 && <p className="text-sm text-faint">No talent linked yet.</p>}
            </div>
          </Section>

          {projects.length > 0 && (
            <Section title="Projects">
              <div className="space-y-2">
                {projects.map((p) => (
                  <div key={p.id} className="card flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <Link href={`/projects/${p.slug}`} className="truncate font-semibold hover:text-accent-deep hover:underline">
                        {p.title}
                      </Link>
                      <KindBadge kind="project" />
                    </div>
                    <span className="text-xs text-muted">
                      {[labelFor(p.projectType), p.premiereYear].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {formats.length > 0 && (
            <Section title="4.4.Forty Formats">
              <div className="space-y-2">
                {formats.map((f) => (
                  <div key={f.id} className="card flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <Link href={`/formats/${f.slug}`} className="truncate font-semibold hover:text-accent-deep hover:underline">
                        {f.title}
                      </Link>
                      <KindBadge kind="format" />
                    </div>
                    <StatusPill status={f.status} label={labelFor(f.status)} />
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        <aside className="min-w-0 space-y-6">
          {commonLocations.length > 0 && (
            <div className="card p-4">
              <div className="overline mb-2">Common Locations</div>
              <ul className="space-y-1 text-sm">
                {commonLocations.map((l) => (
                  <li key={l.slug} className="flex justify-between gap-2">
                    <Link href={`/explore/location/${l.slug}`} className="truncate hover:text-accent-deep hover:underline">{l.name}</Link>
                    <span className="text-xs text-muted">{l.n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {commonOrgs.length > 0 && (
            <div className="card p-4">
              <div className="overline mb-2">Common Organizations</div>
              <ul className="space-y-1 text-sm">
                {commonOrgs.map((o) => (
                  <li key={o.slug} className="flex justify-between gap-2">
                    <Link href={`/organizations/${o.slug}`} className="truncate hover:text-accent-deep hover:underline">{o.name}</Link>
                    <span className="text-xs text-muted">{o.n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {relatedInterests.length > 0 && (
            <div className="card p-4">
              <div className="overline mb-2">Related Interests</div>
              <div className="flex flex-wrap gap-1.5">
                {relatedInterests.map((r) => (
                  <Link key={r.slug} href={`/explore/${r.kind}/${r.slug}`} className="chip">
                    {r.name}
                    <span className="text-xs text-faint">{r.n}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
