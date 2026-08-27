import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { YouTubeHeader } from "@/components/youtube-nav";
import { ChannelIdeaRow } from "@/components/channel-ideas";
import { CHANNEL_IDEA_STATUSES } from "@/lib/taxonomy";

export const metadata = { title: "YouTube Ideas" };

// Every idea across every channel: the production queue for the business,
// rather than something you have to open six channels to see.

export default async function YouTubeIdeasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const status = one(params.status);
  const q = one(params.q)?.trim();
  const canEdit = hasRole(user, "EDITOR");

  const where: Prisma.ChannelIdeaWhereInput = {
    channel: { archived: false },
    ...(status ? { status } : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
  };

  const [ideas, counts] = await Promise.all([
    db.channelIdea.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
      include: { channel: { select: { name: true, slug: true, status: true } } },
    }),
    db.channelIdea.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { channel: { archived: false } },
    }),
  ]);

  const countFor = new Map(counts.map((c) => [c.status, c._count._all]));
  const total = counts.reduce((n, c) => n + c._count._all, 0);

  const chip = (value: string | null) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (value) p.set("status", value);
    const qs = p.toString();
    return `/youtube/ideas${qs ? `?${qs}` : ""}`;
  };

  // Grouped by channel so the page reads as "what each channel is making"
  // rather than as one long undifferentiated list.
  const byChannel = new Map<string, { name: string; slug: string; items: typeof ideas }>();
  for (const idea of ideas) {
    const entry = byChannel.get(idea.channel.slug) ?? {
      name: idea.channel.name,
      slug: idea.channel.slug,
      items: [] as typeof ideas,
    };
    entry.items.push(idea);
    byChannel.set(idea.channel.slug, entry);
  }

  return (
    <div>
      <YouTubeHeader active="/youtube/ideas" />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Link href={chip(null)} className={`chip ${!status ? "bg-wash font-semibold" : "text-muted hover:text-accent-deep"}`}>
          All <span className="text-xs text-faint">{total}</span>
        </Link>
        {CHANNEL_IDEA_STATUSES.map((s) => (
          <Link
            key={s.value}
            href={chip(s.value)}
            className={`chip ${status === s.value ? "bg-wash font-semibold" : "text-muted hover:text-accent-deep"}`}
          >
            {s.label} <span className="text-xs text-faint">{countFor.get(s.value) ?? 0}</span>
          </Link>
        ))}
      </div>

      <form className="mb-5 max-w-xs">
        <input type="search" name="q" placeholder="Search ideas…" defaultValue={q ?? ""} aria-label="Search ideas" />
        {status && <input type="hidden" name="status" value={status} />}
      </form>

      {byChannel.size === 0 ? (
        <p className="text-sm text-faint">
          {q || status ? "Nothing matches that." : "No ideas queued yet — add them from a channel's page."}
        </p>
      ) : (
        <div className="space-y-6">
          {[...byChannel.values()].map((group) => (
            <section key={group.slug}>
              <div className="mb-2 flex items-baseline gap-2">
                <Link href={`/youtube/${group.slug}`} className="font-display text-base font-bold hover:text-accent">
                  {group.name}
                </Link>
                <span className="text-xs text-faint">{group.items.length}</span>
              </div>
              <ul className="space-y-1.5">
                {group.items.map((idea) => (
                  <ChannelIdeaRow
                    key={idea.id}
                    idea={{ id: idea.id, title: idea.title, status: idea.status, notes: idea.notes }}
                    canEdit={canEdit}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {ideas.length === 200 && (
        <p className="mt-4 text-xs text-faint">
          Showing the 200 most recently touched — narrow it with a status or a search.
        </p>
      )}
    </div>
  );
}
