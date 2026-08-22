import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { resolveTargets } from "@/lib/resolve-targets";
import { Portrait, Section } from "@/components/ui";

export const metadata = { title: "Favorites" };

const GROUPS: [string, string][] = [
  ["creator", "Talent"],
  ["format", "Formats"],
  ["project", "Projects"],
  ["organization", "Organizations"],
];

export default async function FavoritesPage() {
  const user = await requireUser();
  const favorites = await db.favorite.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  const resolved = await resolveTargets(favorites);

  return (
    <div>
      <h1 className="mb-6 font-display text-3xl font-bold tracking-tight">FAVORITES</h1>
      {favorites.length === 0 && (
        <p className="text-sm text-faint">
          Nothing favorited yet — use the ☆ on any talent profile, format, project, or organization.
        </p>
      )}
      {GROUPS.map(([type, title]) => {
        const items = favorites
          .filter((f) => f.targetType === type)
          .map((f) => resolved.get(`${f.targetType}:${f.targetId}`))
          .filter((r): r is NonNullable<typeof r> => !!r && !r.archived);
        if (!items.length) return null;
        return (
          <Section key={type} title={title}>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((r) => (
                <Link key={r.targetId} href={r.href} className="card flex items-center gap-3 p-3 transition-shadow hover:shadow-pop">
                  {type === "creator" && (
                    <Portrait name={r.label} imageUrl={r.imageUrl} className="h-9 w-9 shrink-0 rounded" textClass="text-xs" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{r.label}</span>
                    {r.sub && <span className="block truncate text-xs text-muted">{r.sub}</span>}
                  </span>
                </Link>
              ))}
            </div>
          </Section>
        );
      })}
    </div>
  );
}
