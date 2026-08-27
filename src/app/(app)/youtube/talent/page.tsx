import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { YouTubeHeader } from "@/components/youtube-nav";
import { RecordTable } from "@/components/record-table";
import { StatusPill } from "@/components/ui";
import { parseSort } from "@/lib/directory-sort";
import { compactNumber, relativeTime } from "@/lib/format";
import { labelFor, socialLabel } from "@/lib/taxonomy";

export const metadata = { title: "YouTube Talent" };

// The talent side of the channels business, in two halves: who we already run
// a channel for, and who has an audience on YouTube that we do not. The second
// half is the prospect list, and it is computed rather than maintained.

export default async function YouTubeTalentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const sort = parseSort(one(params.sort), "audience-desc");

  const [withChannels, prospects] = await Promise.all([
    db.channel.findMany({
      where: { archived: false, creatorId: { not: null } },
      orderBy: [{ subscribers: { sort: "desc", nulls: "last" } }, { name: "asc" }],
      include: {
        creator: {
          select: {
            name: true, slug: true, headline: true,
            socialProfiles: { where: { platform: "youtube" }, select: { followerCount: true, handle: true } },
          },
        },
        _count: { select: { ideas: true } },
      },
    }),
    db.creator.findMany({
      where: {
        archived: false,
        channels: { none: {} },
        socialProfiles: { some: { platform: "youtube", followerCount: { gt: 0 } } },
      },
      select: {
        id: true, name: true, slug: true, headline: true, updatedAt: true,
        socialProfiles: { where: { platform: "youtube" }, select: { followerCount: true, handle: true, url: true } },
        entityLinks: {
          where: { entity: { kind: { in: ["sport", "creator_category"] } } },
          select: { entity: { select: { name: true } } },
          take: 3,
        },
      },
    }),
  ]);

  const ranked = prospects
    .map((p) => ({ ...p, audience: p.socialProfiles.reduce((n, s) => n + (s.followerCount ?? 0), 0) }))
    .sort((a, b) => (sort.desc ? b.audience - a.audience : a.audience - b.audience));

  return (
    <div>
      <YouTubeHeader active="/youtube/talent" />

      <section className="mb-8">
        <div className="mb-2 flex items-baseline gap-3">
          <h2 className="font-display text-xl font-bold">Talent we run a channel for</h2>
          <span className="text-sm text-muted">{withChannels.length}</span>
        </div>
        {withChannels.length === 0 ? (
          <p className="text-sm text-faint">No channel is linked to a talent record yet.</p>
        ) : (
          <div className="space-y-1.5">
            {withChannels.map((c) => (
              <div key={c.id} className="card flex flex-wrap items-baseline justify-between gap-3 px-3.5 py-2.5">
                <span className="min-w-0">
                  <Link href={`/youtube/${c.slug}`} className="block truncate text-sm font-semibold hover:text-accent">
                    {c.name}
                  </Link>
                  <span className="block truncate text-xs text-muted">
                    <Link href={`/talent/${c.creator!.slug}`} className="underline underline-offset-2 hover:text-accent">
                      {c.creator!.name}
                    </Link>
                    {c.creator!.headline ? ` — ${c.creator!.headline}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-right">
                    <span className="block text-sm font-semibold tabular-nums">
                      {c.subscribers != null ? compactNumber(c.subscribers) : "—"}
                    </span>
                    <span className="block text-xs text-faint">
                      {c._count.ideas} idea{c._count.ideas === 1 ? "" : "s"}
                    </span>
                  </span>
                  <StatusPill status={c.status} label={labelFor(c.status)} />
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-1 flex items-baseline gap-3">
          <h2 className="font-display text-xl font-bold">Worth a channel</h2>
          <span className="text-sm text-muted">{ranked.length}</span>
        </div>
        <p className="mb-3 max-w-2xl text-sm text-muted">
          Talent with an audience on {socialLabel("youtube")} already and no channel of ours —
          the list this business exists to work through. It keeps itself up to date: adding a
          channel takes someone off it.
        </p>
        <RecordTable
          sort={sort}
          empty="Everyone with a YouTube audience already has a channel here."
          columns={[
            { label: "Talent", sortKey: "name" },
            { label: "Handle" },
            { label: "Audience", sortKey: "audience", align: "right" },
            { label: "Known for", showAt: "hidden md:table-cell" },
            { label: "Updated", showAt: "hidden lg:table-cell" },
          ]}
          rows={ranked.map((p) => ({
            id: p.id,
            href: `/talent/${p.slug}`,
            cells: [
              <span key="n">
                {p.name}
                {p.headline && <span className="block text-xs font-normal text-muted line-clamp-1">{p.headline}</span>}
              </span>,
              <span key="h" className="text-muted">
                {p.socialProfiles[0]?.handle ?? <span className="text-faint">—</span>}
              </span>,
              <span key="a" className="tabular-nums font-medium">{compactNumber(p.audience)}</span>,
              <span key="k" className="line-clamp-1 text-muted">
                {p.entityLinks.map((l) => l.entity.name).join(", ") || <span className="text-faint">—</span>}
              </span>,
              <span key="u" className="whitespace-nowrap text-muted">{relativeTime(p.updatedAt)}</span>,
            ],
          }))}
        />
      </section>
    </div>
  );
}
