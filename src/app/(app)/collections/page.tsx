import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { Section } from "@/components/ui";
import { SavedViewList } from "@/components/saved-view-list";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Collections" };

export default async function CollectionsPage() {
  const user = await requireUser();
  const [collections, savedViews] = await Promise.all([
    db.collection.findMany({
      orderBy: { updatedAt: "desc" },
      include: { owner: { select: { name: true } }, _count: { select: { items: true } } },
    }),
    db.savedView.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">COLLECTIONS</h1>
          <span className="text-sm text-muted">{collections.length}</span>
        </div>
        {hasRole(user, "EDITOR") && (
          <Link href="/collections/new" className="btn btn-accent">+ New Collection</Link>
        )}
      </div>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        <strong>Collections</strong> are hand-picked static lists. <strong>Saved Views</strong> are
        live filters — their results update automatically as the database changes.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {collections.map((c) => (
          <Link key={c.id} href={`/collections/${c.slug}`} className="card block p-4 transition-shadow hover:shadow-pop">
            <div className="flex items-start justify-between gap-2">
              <div className="font-display text-base font-bold">{c.name}</div>
              <span className="kind-badge kind-project">Collection</span>
            </div>
            {c.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{c.description}</p>}
            <div className="mt-2 text-xs text-faint">
              {c._count.items} items · {c.owner?.name ?? "—"} · updated {relativeTime(c.updatedAt)}
            </div>
          </Link>
        ))}
        {collections.length === 0 && (
          <p className="text-sm text-faint">No collections yet.</p>
        )}
      </div>

      <div className="mt-10">
        <Section title="My Saved Views">
          <SavedViewList
            views={savedViews.map((v) => ({
              id: v.id,
              name: v.name,
              href: `/${v.targetType}?${v.query}`,
              targetType: v.targetType,
            }))}
          />
        </Section>
      </div>
    </div>
  );
}
