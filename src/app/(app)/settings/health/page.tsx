import Link from "next/link";
import { requireUser, hasRole } from "@/lib/auth";
import { healthBuckets, healthRows, teamMembers, VERIFY_DAYS } from "@/lib/health";
import { DETAIL_TYPES } from "@/lib/record-fields";
import { typeLabel } from "@/lib/record-types";
import { HealthTable } from "@/components/settings/health-table";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Health" };

const BUCKETS = ["unowned", "unverified", "empty"] as const;
type Bucket = (typeof BUCKETS)[number];

export default async function HealthPage({ searchParams }: { searchParams: Promise<{ bucket?: string; type?: string }> }) {
  const user = await requireUser();
  const canEdit = hasRole(user, "EDITOR");
  const params = await searchParams;
  const bucket = (BUCKETS as readonly string[]).includes(params.bucket ?? "") ? (params.bucket as Bucket) : null;
  const type = params.type && DETAIL_TYPES.includes(params.type as never) ? params.type : null;

  const { buckets, total } = await healthBuckets();
  const [members, rows] = await Promise.all([
    teamMembers(),
    bucket && type ? healthRows(bucket, type) : Promise.resolve([]),
  ]);

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-bold tracking-tight">HEALTH</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        {total === 0
          ? "Every record has an owner, has been checked recently, and has something in it. Nothing to do here."
          : "What the Repo knows is thin. Pick a bucket, then a record type, and work the list — you can set an owner or verify a whole selection at once."}
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        {buckets.map((b) => (
          <Link key={b.key} href={b.count ? `/settings/health?bucket=${b.key}` : "/settings/health"}
            aria-current={bucket === b.key ? "page" : undefined}
            className={`card block p-4 transition-colors ${bucket === b.key ? "border-accent" : b.count ? "hover:border-accent" : "opacity-60"}`}>
            <div className="font-display text-2xl font-bold tabular-nums">{b.count.toLocaleString()}</div>
            <div className="mt-0.5 text-sm font-semibold">{b.label}</div>
            <p className="mt-1 text-xs text-muted">{b.blurb}</p>
          </Link>
        ))}
      </div>

      {bucket && (
        <section className="mt-8" aria-label="Records in this bucket">
          <h2 className="overline mb-2">{buckets.find((b) => b.key === bucket)?.label} — by record type</h2>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {DETAIL_TYPES.map((t) => (
              <Link key={t} href={`/settings/health?bucket=${bucket}&type=${t}`} aria-current={type === t ? "page" : undefined}
                className={`chip ${type === t ? "!border-ink !bg-ink !text-paper" : ""}`}>{typeLabel(t)}</Link>
            ))}
          </div>
          {!type && <p className="text-sm text-faint">Pick a record type to work through.</p>}
          {type && rows.length === 0 && <p className="text-sm text-faint">Nothing of this type is in this bucket.</p>}
          {type && rows.length > 0 && (
            <HealthTable
              recordType={type}
              canEdit={canEdit}
              members={members}
              rows={rows.map((r) => ({
                id: r.id, name: r.name, href: r.href,
                sub: bucket === "unverified"
                  ? (r.verifiedAt ? `checked ${relativeTime(r.verifiedAt)}` : "never checked")
                  : bucket === "empty" ? `${r.filled} of ${r.total} fields filled` : "no owner",
              }))}
            />
          )}
        </section>
      )}

      <p className="mt-8 text-xs text-faint">
        “Not checked” means nobody has pressed Verify on the record in {VERIFY_DAYS} days. The same list drives the
        Unverified marker in search and the Needs attention module on the home page.
      </p>
    </div>
  );
}
