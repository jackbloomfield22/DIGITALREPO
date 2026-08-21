import Link from "next/link";
import { computeDataHealth } from "@/lib/data-health";
import { Section } from "@/components/ui";
import { MergeButtons, RestoreButton } from "@/components/admin/merge-restore";
import { labelFor } from "@/lib/taxonomy";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Data Health" };

export default async function DataHealthPage() {
  const health = await computeDataHealth();

  const list = (items: { id: string; name?: string; title?: string; slug: string }[], base: string) => (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <Link key={i.id} href={`${base}/${i.slug}`} className="chip">
          {i.name ?? i.title}
        </Link>
      ))}
      {items.length === 0 && <span className="text-sm text-faint">None — looking good.</span>}
    </div>
  );

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 font-display text-3xl font-bold tracking-tight">DATA HEALTH</h1>
      <p className="mb-6 text-sm text-muted">
        Duplicates, stale records, and gaps — with safe resolution tools.
      </p>

      <Section title="Possible Duplicates">
        {health.duplicates.length === 0 && (
          <p className="text-sm text-faint">No likely duplicates detected.</p>
        )}
        <div className="space-y-3">
          {health.duplicates.map((group, i) => (
            <div key={i} className="card p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="kind-badge kind-project">{labelFor(group.kind)}</span>
                {group.items.map((item) => (
                  <Link key={item.id} href={item.href} className="chip">
                    {item.label}
                    {item.detail && <span className="text-xs text-faint">{item.detail}</span>}
                  </Link>
                ))}
              </div>
              {(group.kind === "organization" || group.kind === "entity") && (
                <MergeButtons kind={group.kind} items={group.items.map((i2) => ({ id: i2.id, label: i2.label }))} />
              )}
              {(group.kind === "creator" || group.kind === "project") && (
                <p className="mt-1.5 text-xs text-muted">
                  Review both records; archive the duplicate from its table view if confirmed.
                </p>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Needs Review (not verified in 180+ days)">
        <div className="flex flex-wrap gap-1.5">
          {health.staleCreators.map((c) => (
            <Link key={c.id} href={`/creators/${c.slug}`} className="chip">
              {c.name}
              <span className="text-xs text-faint">
                {c.lastVerifiedAt ? relativeTime(c.lastVerifiedAt) : "never verified"}
              </span>
            </Link>
          ))}
          {health.staleCreators.length === 0 && <span className="text-sm text-faint">All creators recently verified.</span>}
        </div>
      </Section>

      <Section title="Stale Social Counts (120+ days)">
        <div className="flex flex-wrap gap-1.5">
          {health.staleSocials.map((s) => (
            <Link key={s.id} href={`/creators/${s.creator.slug}`} className="chip">
              {s.creator.name}
              <span className="text-xs text-faint">{s.platform}</span>
            </Link>
          ))}
          {health.staleSocials.length === 0 && <span className="text-sm text-faint">All counts fresh.</span>}
        </div>
      </Section>

      <Section title="Creators Without Interests">{list(health.noInterests, "/creators")}</Section>
      <Section title="Creators Without Projects">{list(health.noProjects, "/creators")}</Section>
      <Section title="Creators Without Sources">{list(health.noSources, "/creators")}</Section>
      <Section title="Orphaned Projects (no talent, no organizations)">
        {list(health.orphanProjects, "/projects")}
      </Section>

      <Section title="Archived Records">
        <div className="space-y-1.5 text-sm">
          {(
            [
              ["creator", health.archived.creators],
              ["project", health.archived.projects],
              ["organization", health.archived.organizations],
              ["format", health.archived.formats],
            ] as const
          ).flatMap(([type, items]) =>
            items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2">
                <span>
                  {"name" in item ? item.name : item.title}
                  <span className="ml-2 text-xs text-faint">{labelFor(type)}</span>
                </span>
                <RestoreButton targetType={type} targetId={item.id} label={"name" in item ? item.name : item.title} />
              </div>
            )),
          )}
          {Object.values(health.archived).every((a) => a.length === 0) && (
            <p className="text-faint">Nothing archived.</p>
          )}
        </div>
      </Section>
    </div>
  );
}
