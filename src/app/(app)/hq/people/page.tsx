import Link from "next/link";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/hq/owner";
import { HqFrame } from "@/components/hq/nav";
import { PeopleAdd } from "@/components/hq/people-add";
import { TIERS, TIER_CADENCE, hqLabel } from "@/lib/hq/vocab";

export const metadata = { title: "HQ · People" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "", label: "Everyone" },
  { key: "inner", label: "Inner circle" },
  { key: "active", label: "Active" },
  { key: "cold", label: "Going cold" },
  { key: "new", label: "Never contacted" },
];

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string; add?: string }> }) {
  const user = await requireOwner();
  const { filter = "", q = "", add } = await searchParams;
  const rows = await db.hqRelationship.findMany({
    where: { ownerId: user.id, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { notes: { contains: q, mode: "insensitive" } }, { interests: { has: q } }] } : {}) },
    orderBy: [{ lastContactAt: { sort: "desc", nulls: "last" } }, { name: "asc" }],
    include: { _count: { select: { interactions: true, pipelines: true } }, pipelines: { include: { pipeline: { select: { title: true, stage: true } } }, take: 3 } },
  });
  const now = new Date().getTime();
  const since = (d: Date | null) => (d ? Math.floor((now - d.getTime()) / 86_400_000) : null);
  const cold = (r: (typeof rows)[number]) => {
    const cadence = r.cadenceDays ?? TIER_CADENCE[r.tier];
    const s = since(r.lastContactAt);
    return (r.nextTouchAt && r.nextTouchAt.getTime() < now) || (!!cadence && s !== null && s > cadence) || (!!cadence && s === null && (r.tier === "inner" || r.tier === "active"));
  };
  const list = rows.filter((r) =>
    filter === "inner" ? r.tier === "inner" : filter === "active" ? r.tier === "active" || r.tier === "inner" : filter === "cold" ? cold(r) : filter === "new" ? !r.lastContactAt : true,
  );

  return (
    <HqFrame active="/hq/people">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">People</h1>
          <p className="text-sm text-muted">{rows.length} relationships · {rows.filter(cold).length} going cold · {rows.filter((r) => r.tier === "inner").length} inner circle</p>
        </div>
        <Link href="/hq/people?add=1" className="btn btn-primary btn-sm">+ Add person</Link>
      </div>
      {add && <PeopleAdd />}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/hq/people${f.key ? `?filter=${f.key}` : ""}`} className={`chip ${filter === f.key ? "chip-on" : ""}`}>{f.label}</Link>
        ))}
        <form className="ml-auto" action="/hq/people">
          {filter && <input type="hidden" name="filter" value={filter} />}
          <input name="q" defaultValue={q} placeholder="Search name, notes, interests" className="!w-64 text-sm" />
        </form>
      </div>
      {list.length === 0 ? (
        <div className="card p-5 text-sm text-muted">Nobody here yet. Add someone above, log a conversation, or <Link href="/hq/settings" className="underline hover:text-accent">seed from the Repo</Link>.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-wash text-left text-xs uppercase tracking-wide text-muted">
              <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Circle</th><th className="px-3 py-2">Last contact</th><th className="px-3 py-2">Next touch</th><th className="px-3 py-2">On</th><th className="px-3 py-2">Interests</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((r) => {
                const s = since(r.lastContactAt);
                return (
                  <tr key={r.id} className={cold(r) ? "bg-[#fbf3ee]/60" : ""}>
                    <td className="px-3 py-2"><Link href={`/hq/people/${r.id}`} className="font-medium hover:text-accent">{r.name}</Link>{r.personType === "creator" && <span className="ml-1 text-xs text-faint">talent</span>}</td>
                    <td className="px-3 py-2 text-muted">{hqLabel(TIERS, r.tier)}</td>
                    <td className={`px-3 py-2 ${cold(r) ? "text-[#8a3a30]" : "text-muted"}`}>{s === null ? "never" : s === 0 ? "today" : `${s}d ago`}</td>
                    <td className="px-3 py-2 text-muted">{r.nextTouchAt ? r.nextTouchAt.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}</td>
                    <td className="px-3 py-2 text-xs text-muted">{r.pipelines.map((p) => p.pipeline.title).join(", ")}{r._count.pipelines > 3 ? ` +${r._count.pipelines - 3}` : ""}</td>
                    <td className="px-3 py-2 text-xs text-faint">{r.interests.slice(0, 4).join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </HqFrame>
  );
}
