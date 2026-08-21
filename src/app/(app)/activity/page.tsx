import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { resolveTargets } from "@/lib/resolve-targets";
import { labelFor } from "@/lib/taxonomy";

export const metadata = { title: "Activity" };

const TYPE_OPTIONS = ["creator", "project", "organization", "format", "opportunity", "person", "entity", "collection"];

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; id?: string; user?: string; page?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const PAGE_SIZE = 50;

  const where: Prisma.AuditLogWhereInput = {
    ...(params.type ? { targetType: params.type } : {}),
    ...(params.id ? { targetId: params.id } : {}),
    ...(params.user ? { userId: params.user } : {}),
  };

  const [entries, total, users] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.auditLog.count({ where }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const resolved = await resolveTargets(
    entries.map((e) => ({ targetType: e.targetType, targetId: e.targetId })),
  );

  // Group by day
  const byDay = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = e.createdAt.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    const list = byDay.get(key) ?? [];
    list.push(e);
    byDay.set(key, list);
  }

  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { ...params, ...patch, page: undefined };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const qs = p.toString();
    return `/activity${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <h1 className="mb-1 font-display text-3xl font-bold tracking-tight">RECENT ACTIVITY</h1>
      <p className="mb-5 text-sm text-muted">Every change to the Digital Bible, newest first.</p>

      <div className="mb-6 flex flex-wrap items-center gap-1.5 text-sm">
        <Link href={link({ type: undefined })} className={`chip ${!params.type ? "bg-wash font-semibold" : ""}`}>All types</Link>
        {TYPE_OPTIONS.map((t) => (
          <Link key={t} href={link({ type: t, id: undefined })} className={`chip ${params.type === t ? "bg-wash font-semibold" : ""}`}>
            {labelFor(t)}
          </Link>
        ))}
        <span className="mx-2 text-faint">·</span>
        <Link href={link({ user: undefined })} className={`chip ${!params.user ? "bg-wash font-semibold" : ""}`}>Anyone</Link>
        {users.map((u) => (
          <Link key={u.id} href={link({ user: u.id })} className={`chip ${params.user === u.id ? "bg-wash font-semibold" : ""}`}>
            {u.name}
          </Link>
        ))}
      </div>

      {[...byDay.entries()].map(([day, dayEntries]) => (
        <div key={day} className="mb-6">
          <div className="overline mb-2">{day}</div>
          <div className="card divide-y divide-line">
            {dayEntries.map((e) => {
              const r = resolved.get(`${e.targetType}:${e.targetId}`);
              return (
                <div key={e.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 py-2 text-sm">
                  <span className="text-xs text-faint">
                    {e.createdAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className="font-medium">{e.userName ?? "System"}</span>
                  <span className="text-muted">{e.action}</span>
                  {r ? (
                    <Link href={r.href} className="font-medium text-charcoal hover:text-accent-deep hover:underline">
                      {e.targetLabel}
                    </Link>
                  ) : (
                    <span className="font-medium">{e.targetLabel}</span>
                  )}
                  <span className="text-xs text-faint">{labelFor(e.targetType)}</span>
                  {e.field && <span className="text-xs text-muted">· {e.field}</span>}
                  {(e.oldValue || e.newValue) && (
                    <span className="text-xs text-muted">
                      {e.oldValue ? `${e.oldValue.slice(0, 60)} → ` : ""}
                      {e.newValue?.slice(0, 60) ?? ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {entries.length === 0 && <p className="text-sm text-faint">No activity recorded yet.</p>}

      {total > PAGE_SIZE && (
        <nav className="mt-6 flex justify-center gap-2 text-sm" aria-label="Pagination">
          {page > 1 && (
            <Link className="btn btn-secondary btn-sm" href={`/activity?${new URLSearchParams({ ...params, page: String(page - 1) } as Record<string, string>)}`}>
              ← Newer
            </Link>
          )}
          {page * PAGE_SIZE < total && (
            <Link className="btn btn-secondary btn-sm" href={`/activity?${new URLSearchParams({ ...params, page: String(page + 1) } as Record<string, string>)}`}>
              Older →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
