import { db } from "@/lib/db";
import { BackupControls, DeleteSnapshotButton } from "@/components/admin/backup-controls";
import { formatDate, relativeTime } from "@/lib/format";

export const metadata = { title: "Backups" };

export default async function BackupsPage() {
  const snapshots = await db.snapshot.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, label: true, counts: true, sizeBytes: true, createdAt: true },
    take: 50,
  });

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 font-display text-3xl font-bold tracking-tight">BACKUPS</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Complete snapshots of everything in the Digital Bible — users, creators, every
        relationship, notes, and history. A snapshot is taken automatically every day
        (the newest 14 daily snapshots are kept; manual backups are kept until you delete
        them). Download copies periodically and keep them somewhere safe — a downloaded
        file can restore the entire database.
      </p>

      <BackupControls />

      <div className="mt-6 space-y-2">
        {snapshots.map((s) => {
          const counts = (s.counts ?? {}) as Record<string, number>;
          const summary = [
            counts.creator != null ? `${counts.creator} creators` : null,
            counts.project != null ? `${counts.project} projects` : null,
            counts.organization != null ? `${counts.organization} orgs` : null,
            counts.format != null ? `${counts.format} formats` : null,
            counts.user != null ? `${counts.user} users` : null,
            counts.auditLog != null ? `${counts.auditLog} history entries` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <div key={s.id} className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {formatDate(s.createdAt)}
                  <span className="text-xs font-normal text-faint">{relativeTime(s.createdAt)}</span>
                  <span className="kind-badge kind-project">{s.kind}</span>
                  {s.label && <span className="text-xs font-normal text-muted">{s.label}</span>}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {summary} · {(s.sizeBytes / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a href={`/api/admin/backups/${s.id}`} className="btn btn-secondary btn-sm" download>
                  Download
                </a>
                <DeleteSnapshotButton id={s.id} />
              </div>
            </div>
          );
        })}
        {snapshots.length === 0 && (
          <p className="text-sm text-faint">
            No backups yet — click “Back Up Now”, and the daily automatic backup will take
            it from here.
          </p>
        )}
      </div>

      <div className="mt-8 card p-4 text-sm text-muted">
        <div className="overline mb-2">Restoring</div>
        <p>
          To restore a downloaded backup into a database, run{" "}
          <code className="rounded bg-wash px-1">
            DATABASE_URL=&quot;…&quot; node scripts/restore-backup.mjs backup.json
          </code>{" "}
          from the project folder. This replaces the database contents with the backup —
          it will ask for confirmation first. Your database host (e.g. Neon) also keeps its
          own point-in-time recovery as an extra safety net.
        </p>
      </div>
    </div>
  );
}
