import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { resolveTargets } from "@/lib/resolve-targets";
import { Portrait } from "@/components/ui";
import { targetTypeLabel } from "@/lib/taxonomy";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Recently Viewed" };

export default async function RecentPage() {
  const user = await requireUser();
  const recents = await db.recentView.findMany({
    where: { userId: user.id },
    orderBy: { viewedAt: "desc" },
    take: 50,
  });
  const resolved = await resolveTargets(recents);

  return (
    <div>
      <h1 className="mb-1 font-display text-3xl font-bold tracking-tight">RECENTLY VIEWED</h1>
      <p className="mb-6 text-sm text-muted">Retrace your research path.</p>
      <div className="max-w-2xl space-y-1.5">
        {recents.map((recent) => {
          const r = resolved.get(`${recent.targetType}:${recent.targetId}`);
          if (!r || r.archived) return null;
          return (
            <Link
              key={recent.id}
              href={r.href}
              className="card flex items-center gap-3 px-4 py-2.5 transition-shadow hover:shadow-pop"
            >
              {recent.targetType === "creator" ? (
                <Portrait name={r.label} imageUrl={r.imageUrl} className="h-8 w-8 shrink-0 rounded" textClass="text-[11px]" />
              ) : (
                <span className="kind-badge kind-project w-20 shrink-0 text-center">{targetTypeLabel(recent.targetType)}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.label}</span>
                {r.sub && <span className="block truncate text-xs text-muted">{r.sub}</span>}
              </span>
              <span className="shrink-0 text-xs text-faint">{relativeTime(recent.viewedAt)}</span>
            </Link>
          );
        })}
        {recents.length === 0 && <p className="text-sm text-faint">No recently viewed records yet.</p>}
      </div>
    </div>
  );
}
