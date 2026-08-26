import { db } from "@/lib/db";
import { databaseUsage, offsiteBackupConfigured } from "@/lib/backup";
import { BackupControls, DeleteSnapshotButton } from "@/components/admin/backup-controls";
import { formatDate, relativeTime } from "@/lib/format";

export const metadata = { title: "Backups" };

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 2 : 1)} MB`;

export default async function BackupsPage() {
  const usage = await databaseUsage();
  const snapshots = await db.snapshot.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, label: true, counts: true, sizeBytes: true, createdAt: true },
    take: 50,
  });

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 font-display text-3xl font-bold tracking-tight">BACKUPS</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Complete snapshots of everything in the 4.4.Forty Repo — users, creators, every
        relationship, notes, and history. A snapshot is taken automatically every day
        (the newest 14 daily snapshots are kept; manual backups are kept until you delete
        them). Download copies periodically and keep them somewhere safe — a downloaded
        file can restore the entire database.
      </p>

      <p className="mb-6 max-w-2xl text-sm text-muted">
        Backups record every uploaded file — its name, type and size, and the record it
        hangs off — but not the file&apos;s contents. That is deliberate: copying the bytes
        into every daily snapshot made the backups many times larger than the Repo they
        protect. Restoring brings back every record and every attachment&apos;s place in
        the Repo; the files themselves would need re-uploading.
      </p>

      {usage && (
        <div className="mb-6">
          <div className="overline mb-2">Database storage</div>
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="card px-3.5 py-2.5">
              <div className="text-xs text-muted">Everything</div>
              <div className="font-display text-xl font-bold tabular-nums">{mb(usage.totalBytes)}</div>
              <div className="text-xs text-faint">whole database</div>
            </div>
            <div className="card px-3.5 py-2.5">
              <div className="text-xs text-muted">Uploaded files</div>
              <div className="font-display text-xl font-bold tabular-nums">{mb(usage.fileBytes)}</div>
              <div className="text-xs text-faint">{usage.fileCount} {usage.fileCount === 1 ? "file" : "files"}</div>
            </div>
            <div className="card px-3.5 py-2.5">
              <div className="text-xs text-muted">Ingested documents</div>
              <div className="font-display text-xl font-bold tabular-nums">{mb(usage.ingestBytes)}</div>
              <div className="text-xs text-faint">with their originals</div>
            </div>
            <div className="card px-3.5 py-2.5">
              <div className="text-xs text-muted">Backups</div>
              <div className="font-display text-xl font-bold tabular-nums">{mb(usage.snapshotBytes)}</div>
              <div className="text-xs text-faint">{usage.snapshotCount} {usage.snapshotCount === 1 ? "snapshot" : "snapshots"}</div>
            </div>
          </div>
          <p className="mt-2 text-xs text-faint">
            Files are stored in the database itself, so uploads count against your Postgres
            plan. If this starts climbing, moving file storage to a dedicated store (Vercel
            Blob) is the next step.
          </p>
        </div>
      )}

      <p className="mb-6 max-w-2xl text-sm">
        {offsiteBackupConfigured() ? (
          <span className="rounded bg-wash px-2 py-1 text-xs">
            ✓ Offsite copies on — every snapshot also uploads encrypted to Vercel Blob,
            outside the database.
          </span>
        ) : (
          <span className="rounded bg-[#f5efdd] px-2 py-1 text-xs text-warn">
            Offsite copies off — snapshots live inside the same database they protect.
            Add a Blob store in Vercel (Storage → Create → Blob) to store encrypted
            copies outside it.
          </span>
        )}
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
          it will ask for confirmation first. Attachments come back as records without
          their contents (see above), and downloading one then says so rather than handing
          you an empty file. Your database host (e.g. Neon) also keeps its own
          point-in-time recovery, which does include the files.
        </p>
      </div>
    </div>
  );
}
