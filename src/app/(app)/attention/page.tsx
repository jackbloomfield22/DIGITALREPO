import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Section } from "@/components/ui";
import { daysAgo, formatDate, nowDate, relativeTime } from "@/lib/format";

export const metadata = { title: "Needs Attention" };

const STALE_DAYS = 90;

type Item = { label: string; sub?: string; href: string };

function Bucket({ title, count, items, blurb }: {
  title: string;
  count: number;
  items: Item[];
  blurb: string;
}) {
  if (count === 0) return null;
  return (
    <Section title={`${title} (${count})`}>
      <p className="mb-2 text-xs text-muted">{blurb}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => (
          <Link key={i.href + i.label} href={i.href} className="chip hover:text-accent-deep">
            {i.label}
            {i.sub && <span className="text-xs text-muted">{i.sub}</span>}
          </Link>
        ))}
        {count > items.length && (
          <span className="chip border-dashed text-muted">+{count - items.length} more</span>
        )}
      </div>
    </Section>
  );
}

export default async function AttentionPage() {
  await requireUser();
  const staleCutoff = daysAgo(STALE_DAYS);
  const weekAhead = daysAgo(-7);
  const now = nowDate();
  const LIMIT = 12;

  const [
    noRep, noRepCount,
    staleSocial, staleSocialCount,
    noProdCo, noProdCoCount,
    deadlines,
    unverified, unverifiedCount,
    sourcedIds,
  ] = await Promise.all([
    db.creator.findMany({
      where: { archived: false, people: { none: { current: true } } },
      select: { name: true, slug: true },
      orderBy: { name: "asc" },
      take: LIMIT,
    }),
    db.creator.count({ where: { archived: false, people: { none: { current: true } } } }),
    db.creator.findMany({
      where: {
        archived: false,
        socialProfiles: {
          some: {
            followerCount: { not: null },
            OR: [{ countUpdatedAt: null }, { countUpdatedAt: { lt: staleCutoff } }],
          },
        },
      },
      select: { name: true, slug: true },
      orderBy: { name: "asc" },
      take: LIMIT,
    }),
    db.creator.count({
      where: {
        archived: false,
        socialProfiles: {
          some: {
            followerCount: { not: null },
            OR: [{ countUpdatedAt: null }, { countUpdatedAt: { lt: staleCutoff } }],
          },
        },
      },
    }),
    db.project.findMany({
      where: { archived: false, organizations: { none: {} } },
      select: { title: true, slug: true },
      orderBy: { title: "asc" },
      take: LIMIT,
    }),
    db.project.count({ where: { archived: false, organizations: { none: {} } } }),
    db.opportunity.findMany({
      where: { archived: false, deadline: { gte: now, lte: weekAhead } },
      select: { title: true, slug: true, deadline: true },
      orderBy: { deadline: "asc" },
      take: LIMIT,
    }),
    db.creator.findMany({
      where: {
        archived: false,
        OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: staleCutoff } }],
      },
      select: { name: true, slug: true, lastVerifiedAt: true },
      orderBy: { lastVerifiedAt: { sort: "asc", nulls: "first" } },
      take: LIMIT,
    }),
    db.creator.count({
      where: {
        archived: false,
        OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: staleCutoff } }],
      },
    }),
    db.recordSource.findMany({
      where: { targetType: "creator" },
      select: { targetId: true },
      distinct: ["targetId"],
    }),
  ]);

  const [noSource, noSourceCount] = await Promise.all([
    db.creator.findMany({
      where: { archived: false, id: { notIn: sourcedIds.map((s) => s.targetId) } },
      select: { name: true, slug: true },
      orderBy: { name: "asc" },
      take: LIMIT,
    }),
    db.creator.count({
      where: { archived: false, id: { notIn: sourcedIds.map((s) => s.targetId) } },
    }),
  ]);

  const total =
    noRepCount + staleSocialCount + noProdCoCount + deadlines.length + unverifiedCount + noSourceCount;

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 font-display text-3xl font-bold tracking-tight">NEEDS ATTENTION</h1>
      <p className="mb-8 text-sm text-muted">
        The maintenance queue — what&apos;s missing, stale, or due soon across the Repo. Work it
        down from the top; each chip links straight to the record.
      </p>

      {total === 0 && (
        <p className="text-sm text-faint">Nothing needs attention right now. The Repo is in good shape.</p>
      )}

      <Bucket
        title="Opportunity deadlines this week"
        count={deadlines.length}
        blurb="Deadlines inside the next 7 days."
        items={deadlines.map((o) => ({
          label: o.title,
          sub: o.deadline ? formatDate(o.deadline) : undefined,
          href: `/opportunities/${o.slug}`,
        }))}
      />
      <Bucket
        title="Talent without current representation"
        count={noRepCount}
        blurb="No agent, manager, or other current rep on file."
        items={noRep.map((c) => ({ label: c.name, href: `/talent/${c.slug}` }))}
      />
      <Bucket
        title={`Social counts older than ${STALE_DAYS} days`}
        count={staleSocialCount}
        blurb="Follower counts that haven't been refreshed in a while."
        items={staleSocial.map((c) => ({ label: c.name, href: `/talent/${c.slug}` }))}
      />
      <Bucket
        title="Projects without a production company"
        count={noProdCoCount}
        blurb="No organization linked — who makes this?"
        items={noProdCo.map((p) => ({ label: p.title, href: `/projects/${p.slug}` }))}
      />
      <Bucket
        title="Talent profiles without a source"
        count={noSourceCount}
        blurb="Nothing on file says where this profile's information came from."
        items={noSource.map((c) => ({ label: c.name, href: `/talent/${c.slug}` }))}
      />
      <Bucket
        title={`Not verified in ${STALE_DAYS}+ days`}
        count={unverifiedCount}
        blurb="Profiles that haven't been re-checked recently — open one and hit Verify after a once-over."
        items={unverified.map((c) => ({
          label: c.name,
          sub: c.lastVerifiedAt ? relativeTime(c.lastVerifiedAt) : "never",
          href: `/talent/${c.slug}`,
        }))}
      />
    </div>
  );
}
