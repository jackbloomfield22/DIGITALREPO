import Link from "next/link";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/hq/owner";
import { HqFrame } from "@/components/hq/nav";
import { IdeaCard, IdeaQuickAdd, type IdeaVM } from "@/components/hq/ideas";
import { IDEA_KINDS, IDEA_STATUSES } from "@/lib/hq/vocab";

export const metadata = { title: "HQ · Ideas" };
export const dynamic = "force-dynamic";

export default async function IdeasPage({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string; sort?: string; tag?: string }> }) {
  const user = await requireOwner();
  const { kind = "", status = "", sort = "touched", tag = "" } = await searchParams;
  const ideas = await db.hqIdea.findMany({
    where: { ownerId: user.id, ...(kind ? { kind } : {}), ...(status ? { status } : { status: { not: "dead" } }), ...(tag ? { tags: { has: tag } } : {}) },
    orderBy: sort === "rating" ? [{ rating: "desc" }, { lastTouchedAt: "desc" }] : sort === "oldest" ? { lastTouchedAt: "asc" } : sort === "newest" ? { createdAt: "desc" } : { lastTouchedAt: "desc" },
    take: 300,
  });
  const vm: IdeaVM[] = ideas.map((i) => ({ ...i, lastTouchedAt: i.lastTouchedAt.toISOString(), createdAt: i.createdAt.toISOString() }));
  const tags = [...new Set(ideas.flatMap((i) => i.tags))].sort().slice(0, 30);
  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ kind, status, sort, tag, ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/hq/ideas${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <HqFrame active="/hq/ideas">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Ideas</h1>
          <p className="text-sm text-muted">The archive for future you. Nothing here is lost; the Today page surfaces three a day.</p>
        </div>
        <span className="text-xs text-faint">{ideas.length} shown</span>
      </div>
      <IdeaQuickAdd />
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
        <Link href={link({ kind: "" })} className={`chip ${!kind ? "chip-on" : ""}`}>All kinds</Link>
        {IDEA_KINDS.map((k) => <Link key={k.value} href={link({ kind: k.value })} className={`chip ${kind === k.value ? "chip-on" : ""}`}>{k.label}</Link>)}
        <span className="mx-1 text-faint">·</span>
        {IDEA_STATUSES.map((s) => <Link key={s.value} href={link({ status: status === s.value ? "" : s.value })} className={`chip ${status === s.value ? "chip-on" : ""}`}>{s.label}</Link>)}
        <span className="ml-auto flex items-center gap-1 text-xs text-muted">
          Sort
          {[["touched", "recent"], ["rating", "strongest"], ["oldest", "forgotten"], ["newest", "newest"]].map(([v, l]) => <Link key={v} href={link({ sort: v })} className={`rounded px-1.5 py-0.5 ${sort === v ? "bg-wash text-charcoal" : "hover:text-accent"}`}>{l}</Link>)}
        </span>
      </div>
      {tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1 text-xs">
          {tags.map((t) => <Link key={t} href={link({ tag: tag === t ? "" : t })} className={`rounded px-1.5 py-0.5 ${tag === t ? "bg-ink text-paper" : "bg-wash text-muted hover:text-accent"}`}>#{t}</Link>)}
        </div>
      )}
      {vm.length === 0 ? (
        <div className="card p-5 text-sm text-muted">Empty. Type one above, or “idea: …” anywhere in HQ.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {vm.map((i) => <IdeaCard key={i.id} idea={i} />)}
        </div>
      )}
    </HqFrame>
  );
}
