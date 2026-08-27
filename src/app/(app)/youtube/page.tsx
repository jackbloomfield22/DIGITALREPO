import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { YouTubeHeader } from "@/components/youtube-nav";
import { StatusPill } from "@/components/ui";
import { compactNumber, isStale, relativeTime } from "@/lib/format";
import { labelFor } from "@/lib/taxonomy";

export const metadata = { title: "YouTube" };

// The front page of the YouTube mini-repo: how big the business is, where each
// channel stands, what is actually in production, and what has gone quiet.

const STALE_DAYS = 60;
const PIPELINE = ["prospect", "in_talks", "signed", "building", "live", "paused"];

export default async function YouTubeOverviewPage() {
  const user = await requireUser();
  const canEdit = hasRole(user, "EDITOR");

  const [channels, reach, ideas, activity, prospects] = await Promise.all([
    db.channel.findMany({
      where: { archived: false },
      orderBy: [{ subscribers: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      include: { creator: { select: { name: true, slug: true } }, _count: { select: { ideas: true } } },
    }),
    db.channel.aggregate({ _sum: { subscribers: true, totalViews: true }, where: { archived: false } }),
    db.channelIdea.findMany({
      where: { status: { in: ["planned", "filming"] } },
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: { channel: { select: { name: true, slug: true } } },
    }),
    db.auditLog.findMany({
      where: { targetType: "channel" },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, userName: true, action: true, field: true, targetLabel: true, newValue: true, createdAt: true },
    }),
    // Talent with a real YouTube audience and no channel of ours — the list
    // this business exists to work through. Ordered by audience, which means
    // ordering on a related row's number: done here rather than in the query.
    db.creator.findMany({
      where: {
        archived: false,
        channels: { none: {} },
        socialProfiles: { some: { platform: "youtube", followerCount: { gt: 0 } } },
      },
      select: {
        name: true, slug: true,
        socialProfiles: { where: { platform: "youtube" }, select: { followerCount: true } },
      },
    }),
  ]);

  const ranked = prospects
    .map((p) => ({ ...p, audience: p.socialProfiles.reduce((n, s) => n + (s.followerCount ?? 0), 0) }))
    .sort((a, b) => b.audience - a.audience)
    .slice(0, 6);

  const byStatus = new Map<string, number>();
  for (const c of channels) byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
  const live = byStatus.get("live") ?? 0;
  const totalIdeas = channels.reduce((n, c) => n + c._count.ideas, 0);

  // What a channels business actually needs chasing: numbers nobody has
  // checked, and channels with nothing queued to make.
  const staleNumbers = channels.filter(
    (c) => c.status === "live" && (!c.countUpdatedAt || isStale(c.countUpdatedAt, STALE_DAYS)),
  );
  const noIdeas = channels.filter((c) => c._count.ideas === 0 && ["signed", "building", "live"].includes(c.status));

  return (
    <div>
      <YouTubeHeader
        active="/youtube"
        action={canEdit ? <Link href="/youtube/new" className="btn btn-primary btn-sm">+ Add Channel</Link> : null}
      />

      {channels.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong bg-wash/50 px-6 py-10 text-center text-sm text-muted">
          Nothing here yet. {canEdit && <Link href="/youtube/new" className="underline">Add the first channel</Link>}, or
          paste the YouTube part of the slate into{" "}
          <Link href="/uploads" className="underline">Add Info</Link> with the YouTube switch on.
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Channels" value={String(channels.length)} sub={`${live} live`} />
            <Stat label="Subscribers" value={compactNumber(reach._sum.subscribers ?? 0)} sub="across the business" />
            <Stat label="Total views" value={compactNumber(reach._sum.totalViews ?? 0)} sub="as last checked" />
            <Stat label="Ideas queued" value={String(totalIdeas)} sub="across every channel" />
          </div>

          <section className="mb-8">
            <div className="overline mb-2">Where everything stands</div>
            <div className="flex flex-wrap gap-1.5">
              {PIPELINE.filter((s) => byStatus.get(s)).map((s) => (
                <Link key={s} href={`/youtube/channels?status=${s}`} className="chip hover:text-accent-deep">
                  {labelFor(s)} <span className="text-xs text-faint">{byStatus.get(s)}</span>
                </Link>
              ))}
            </div>
          </section>

          <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
            <section>
              <div className="overline mb-2">Biggest channels</div>
              <div className="space-y-1.5">
                {channels.slice(0, 6).map((c) => (
                  <Link key={c.id} href={`/youtube/${c.slug}`} className="card flex items-baseline justify-between gap-3 px-3.5 py-2.5 transition-shadow hover:shadow-pop">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{c.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {[c.creator?.name, c.cadence, `${c._count.ideas} idea${c._count.ideas === 1 ? "" : "s"}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums">
                        {c.subscribers != null ? compactNumber(c.subscribers) : "—"}
                      </span>
                      <StatusPill status={c.status} label={labelFor(c.status)} />
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            <section>
              <div className="overline mb-2">In production</div>
              <div className="space-y-1.5">
                {ideas.map((i) => (
                  <Link key={i.id} href={`/youtube/${i.channel.slug}`} className="card flex items-baseline justify-between gap-3 px-3.5 py-2.5 transition-shadow hover:shadow-pop">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{i.title}</span>
                      <span className="block truncate text-xs text-muted">{i.channel.name}</span>
                    </span>
                    <StatusPill status={i.status} label={labelFor(i.status)} />
                  </Link>
                ))}
                {ideas.length === 0 && (
                  <p className="text-sm text-faint">
                    Nothing planned or filming yet — ideas start as ideas and move along from
                    a channel&apos;s page.
                  </p>
                )}
              </div>
            </section>

            {(staleNumbers.length > 0 || noIdeas.length > 0) && (
              <section>
                <div className="overline mb-2">Needs a look</div>
                <div className="space-y-1.5 text-sm">
                  {staleNumbers.slice(0, 5).map((c) => (
                    <Link key={c.id} href={`/youtube/${c.slug}/edit`} className="card block px-3.5 py-2 transition-shadow hover:shadow-pop">
                      <span className="font-medium">{c.name}</span>{" "}
                      <span className="text-warn">
                        {c.countUpdatedAt ? `numbers last checked ${relativeTime(c.countUpdatedAt)}` : "no numbers on record"}
                      </span>
                    </Link>
                  ))}
                  {noIdeas.slice(0, 5).map((c) => (
                    <Link key={c.id} href={`/youtube/${c.slug}`} className="card block px-3.5 py-2 transition-shadow hover:shadow-pop">
                      <span className="font-medium">{c.name}</span>{" "}
                      <span className="text-muted">is {labelFor(c.status).toLowerCase()} with nothing queued to make</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="overline mb-2">Worth a channel</div>
              <p className="mb-2 text-xs text-faint">
                Talent with a YouTube audience already and no channel of ours.
              </p>
              <div className="space-y-1.5">
                {ranked.map((p) => (
                  <Link key={p.slug} href={`/talent/${p.slug}`} className="card flex items-baseline justify-between gap-3 px-3.5 py-2 transition-shadow hover:shadow-pop">
                    <span className="truncate text-sm font-medium">{p.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {compactNumber(p.audience)}
                    </span>
                  </Link>
                ))}
                {ranked.length === 0 && (
                  <p className="text-sm text-faint">Everyone with a YouTube audience already has a channel here.</p>
                )}
              </div>
            </section>
          </div>

          {activity.length > 0 && (
            <section className="mt-8">
              <div className="overline mb-2">Recent activity</div>
              <ul className="space-y-1 text-sm">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{a.userName}</span>{" "}
                      <span className="text-muted">{a.field ?? a.action}</span>{" "}
                      <span className="font-medium">{a.targetLabel}</span>
                      {a.newValue && <span className="text-muted"> — {a.newValue}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-faint">{relativeTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card px-3.5 py-2.5">
      <div className="overline">{label}</div>
      <div className="font-display text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-faint">{sub}</div>
    </div>
  );
}
