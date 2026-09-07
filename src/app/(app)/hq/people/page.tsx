import Link from "next/link";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/hq/owner";
import { HqFrame } from "@/components/hq/nav";
import { PeopleAdd } from "@/components/hq/people-add";
import { TIERS, TIER_CADENCE, hqLabel } from "@/lib/hq/vocab";
import { relationshipStrength } from "@/lib/hq/strength";

export const metadata = { title: "HQ · People" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "", label: "Everyone" },
  { key: "inner", label: "Inner circle" },
  { key: "active", label: "Active" },
  { key: "cold", label: "Going cold" },
  { key: "new", label: "Never contacted" },
  { key: "strong", label: "Strongest" },
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
  // Strength inputs in three grouped queries rather than one per person.
  const [year, quarter, mentions] = await Promise.all([
    db.hqInteraction.groupBy({ by: ["relationshipId"], where: { ownerId: user.id, at: { gte: new Date(now - 365 * 86_400_000) } }, _count: { _all: true } }),
    db.hqInteraction.groupBy({ by: ["relationshipId"], where: { ownerId: user.id, at: { gte: new Date(now - 90 * 86_400_000) } }, _count: { _all: true } }),
    db.hqMention.groupBy({ by: ["targetId"], where: { ownerId: user.id, targetType: "relationship" }, _count: { _all: true } }),
  ]);
  const yearBy = new Map(year.map((r) => [r.relationshipId, r._count._all]));
  const quarterBy = new Map(quarter.map((r) => [r.relationshipId, r._count._all]));
  const mentionBy = new Map(mentions.map((r) => [r.targetId, r._count._all]));
  const strengthOf = (r: (typeof rows)[number]) => {
    // Synthesised dates: n in the last 90 days, the rest spread over the year — enough for the score.
    const q = quarterBy.get(r.id) ?? 0, y = yearBy.get(r.id) ?? 0;
    const dates = [...Array(q)].map(() => new Date(now - 30 * 86_400_000)).concat([...Array(Math.max(0, y - q))].map(() => new Date(now - 200 * 86_400_000)));
    return relationshipStrength({ tier: r.tier, lastContactAt: r.lastContactAt, interactionDates: dates, cardsTogether: r._count.pipelines, mentions: mentionBy.get(r.id) ?? 0 }, new Date(now));
  };
  const since = (d: Date | null) => (d ? Math.floor((now - d.getTime()) / 86_400_000) : null);
  const cold = (r: (typeof rows)[number]) => {
    const cadence = r.cadenceDays ?? TIER_CADENCE[r.tier];
    const s = since(r.lastContactAt);
    return (r.nextTouchAt && r.nextTouchAt.getTime() < now) || (!!cadence && s !== null && s > cadence) || (!!cadence && s === null && (r.tier === "inner" || r.tier === "active"));
  };
  const scored = rows.map((r) => ({ r, s: strengthOf(r) }));
  const list = scored.filter(({ r }) =>
    filter === "inner" ? r.tier === "inner" : filter === "active" ? r.tier === "active" || r.tier === "inner" : filter === "cold" ? cold(r) : filter === "new" ? !r.lastContactAt : true,
  );
  if (filter === "strong") list.sort((a, b) => b.s.score - a.s.score);

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
              <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Circle</th><th className="px-3 py-2">Strength</th><th className="px-3 py-2">Last contact</th><th className="px-3 py-2">Next touch</th><th className="px-3 py-2">On</th><th className="px-3 py-2">Interests</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map(({ r, s: st }) => {
                const s = since(r.lastContactAt);
                return (
                  <tr key={r.id} className={cold(r) ? "bg-[#fbf3ee]/60" : ""}>
                    <td className="px-3 py-2"><Link href={`/hq/people/${r.id}`} className="font-medium hover:text-accent">{r.name}</Link>{r.personType === "creator" && <span className="ml-1 text-xs text-faint">talent</span>}</td>
                    <td className="px-3 py-2 text-muted">{hqLabel(TIERS, r.tier)}</td>
                    <td className="px-3 py-2" title={st.why}>
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className="inline-block h-1.5 w-12 overflow-hidden rounded bg-wash"><span className={`block h-full ${st.label === "strong" ? "bg-ok" : st.label === "steady" ? "bg-warn" : "bg-faint"}`} style={{ width: `${st.score}%` }} /></span>
                        <span className="text-muted">{st.label}</span>
                      </span>
                    </td>
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
