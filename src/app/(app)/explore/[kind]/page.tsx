import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ENTITY_KINDS, ENTITY_KIND_PLURALS, type EntityKind } from "@/lib/taxonomy";

export default async function ExploreKindPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  await requireUser();
  const { kind } = await params;
  if (!(ENTITY_KINDS as readonly string[]).includes(kind)) notFound();

  const entities = await db.entity.findMany({
    where: { kind },
    include: { _count: { select: { creatorLinks: true, projectLinks: true, formatLinks: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="mb-5 flex items-baseline gap-3">
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight">
          {ENTITY_KIND_PLURALS[kind as EntityKind]}
        </h1>
        <span className="text-sm text-muted">{entities.length}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {entities.map((e) => (
          <Link key={e.id} href={`/explore/${kind}/${e.slug}`} className="card flex items-baseline justify-between gap-2 px-4 py-2.5 transition-shadow hover:shadow-pop">
            <span className="truncate font-medium">{e.name}</span>
            <span className="shrink-0 text-xs text-muted">
              {[
                e._count.creatorLinks ? `${e._count.creatorLinks} creators` : null,
                e._count.projectLinks ? `${e._count.projectLinks} projects` : null,
                e._count.formatLinks ? `${e._count.formatLinks} formats` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "unused"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
