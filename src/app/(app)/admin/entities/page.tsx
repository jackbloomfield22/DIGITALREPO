import Link from "next/link";
import { db } from "@/lib/db";
import { Section } from "@/components/ui";
import { EntityMergeTool } from "@/components/admin/entity-merge-tool";
import { ENTITY_KINDS, ENTITY_KIND_PLURALS, type EntityKind } from "@/lib/taxonomy";

export const metadata = { title: "Entities" };

export default async function AdminEntitiesPage() {
  const entities = await db.entity.findMany({
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { creatorLinks: true, projectLinks: true, formatLinks: true, opportunityLinks: true } },
    },
  });

  const byKind = new Map<string, typeof entities>();
  for (const e of entities) {
    (byKind.get(e.kind) ?? byKind.set(e.kind, []).get(e.kind)!).push(e);
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 font-display text-3xl font-bold tracking-tight">ENTITY MANAGEMENT</h1>
      <p className="mb-6 text-sm text-muted">
        The canonical taxonomy. Merge accidental duplicates — all relationships automatically
        move to the record you keep, and the merged name is preserved as an alias.
      </p>

      <EntityMergeTool
        entities={entities.map((e) => ({ id: e.id, name: e.name, kind: e.kind }))}
      />

      {ENTITY_KINDS.map((kind) => {
        const list = byKind.get(kind) ?? [];
        if (!list.length) return null;
        return (
          <Section key={kind} title={ENTITY_KIND_PLURALS[kind as EntityKind]}>
            <div className="flex flex-wrap gap-1.5">
              {list.map((e) => {
                const uses =
                  e._count.creatorLinks + e._count.projectLinks + e._count.formatLinks + e._count.opportunityLinks;
                return (
                  <Link key={e.id} href={`/explore/${e.kind}/${e.slug}`} className="chip">
                    {e.name}
                    <span className={`text-xs ${uses === 0 ? "text-accent" : "text-faint"}`}>{uses}</span>
                  </Link>
                );
              })}
            </div>
          </Section>
        );
      })}
    </div>
  );
}
