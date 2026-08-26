import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { RecordTable } from "@/components/record-table";
import { RowStatus } from "@/components/row-status";
import { Pagination } from "@/components/pagination";
import { parseSort } from "@/lib/directory-sort";
import { compactNumber, formatDate, relativeTime } from "@/lib/format";
import { labelFor, socialLabel } from "@/lib/taxonomy";

export const metadata = { title: "Digital" };

// The digital side of the business in one place. It cuts across everything —
// a YouTube number lives on a talent record, a digital series is a format, the
// person who buys it is an industry contact at a platform — so asking "what
// does our YouTube picture look like?" used to mean four directories and a lot
// of filtering. This is that question, answered on one page.

const PAGE_SIZE = 40;

/** Platforms worth a tab of their own; the rest fold into "All platforms". */
const PLATFORMS = ["youtube", "tiktok", "instagram", "twitch", "podcast"] as const;

/** Format and project types that are digital by nature, whatever the platform. */
const DIGITAL_FORMAT_TYPES = ["digital_series", "branded_series", "podcast"];
const DIGITAL_PROJECT_TYPES = ["digital_franchise", "short_form_series", "social_franchise", "podcast", "livestream"];
const DIGITAL_ORG_TYPES = ["digital_platform", "podcast_company", "creator_owned_company"];
/** Words that mark a format's target platform as digital when the type doesn't. */
const DIGITAL_WORDS = ["youtube", "tiktok", "instagram", "twitch", "snapchat", "digital", "social", "shorts", "podcast", "streaming"];

const TABS = [
  { key: "talent", label: "Talent" },
  { key: "formats", label: "Formats" },
  { key: "projects", label: "Projects" },
  { key: "companies", label: "Platforms & Companies" },
  { key: "contacts", label: "Contacts" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function DigitalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(params.q)?.trim();
  const platform = PLATFORMS.find((p) => p === one(params.platform)) ?? null;
  const tab: TabKey = (TABS.find((t) => t.key === one(params.tab))?.key ?? "talent") as TabKey;
  const page = Math.max(1, Number(one(params.page) ?? 1) || 1);
  const sort = parseSort(one(params.sort), tab === "talent" ? "audience-desc" : "date-desc");
  const canEdit = hasRole(user, "EDITOR");

  // The headline numbers, always on screen: how big the digital footprint is,
  // and how much of the slate is built for it.
  const platformFilter = platform ? { platform } : { platform: { in: [...PLATFORMS] } };
  const [reach, profiled, formatCount, projectCount, companyCount, perPlatform] = await Promise.all([
    db.socialProfile.aggregate({
      _sum: { followerCount: true },
      where: { ...platformFilter, creator: { archived: false } },
    }),
    db.socialProfile
      .findMany({ where: { ...platformFilter, creator: { archived: false } }, select: { creatorId: true }, distinct: ["creatorId"] })
      .then((r) => r.length),
    db.format.count({ where: digitalFormatWhere(platform) }),
    db.project.count({ where: { archived: false, projectType: { in: DIGITAL_PROJECT_TYPES } } }),
    db.organization.count({ where: { archived: false, types: { hasSome: DIGITAL_ORG_TYPES } } }),
    db.socialProfile.groupBy({
      by: ["platform"],
      _sum: { followerCount: true },
      _count: { _all: true },
      where: { creator: { archived: false } },
    }),
  ]);

  const totalReach = reach._sum.followerCount ?? 0;
  const byPlatform = new Map(perPlatform.map((p) => [p.platform, p]));

  const href = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (platform) p.set("platform", platform);
    p.set("tab", tab);
    for (const [k, v] of Object.entries(extra)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    p.delete("page");
    const qs = p.toString();
    return `/digital${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tight">DIGITAL</h1>
        <div className="flex gap-2">
          <Link href="/talent?sort=audience-desc" className="btn btn-secondary btn-sm">All Talent</Link>
          <Link href="/formats" className="btn btn-secondary btn-sm">All Formats</Link>
        </div>
      </div>
      <p className="mb-5 max-w-2xl text-sm text-muted">
        Everything with a screen behind it — the audiences our talent actually own, the
        formats built for those platforms, the digital-native productions, and the people
        who buy them.
      </p>

      {/* Headline numbers for whichever platform you're looking at. */}
      <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={platform ? `${socialLabel(platform)} reach` : "Digital reach"} value={compactNumber(totalReach)} sub={`${profiled} talent with a profile`} />
        <Stat label="Digital formats" value={String(formatCount)} sub="on the slate" />
        <Stat label="Digital projects" value={String(projectCount)} sub="produced or in production" />
        <Stat label="Platforms & digital cos." value={String(companyCount)} sub="in the Repo" />
      </div>

      {/* Platform switch. Counts come from the whole roster, not the current tab. */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Link href={href({ platform: null })} className={`chip ${!platform ? "bg-wash font-semibold" : "text-muted hover:text-accent-deep"}`}>
          All platforms
        </Link>
        {PLATFORMS.map((p) => {
          const row = byPlatform.get(p);
          return (
            <Link
              key={p}
              href={href({ platform: p })}
              className={`chip ${platform === p ? "bg-wash font-semibold" : "text-muted hover:text-accent-deep"}`}
            >
              {socialLabel(p)}{" "}
              <span className="text-xs text-faint">{compactNumber(row?._sum.followerCount ?? 0)}</span>
            </Link>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5 border-b border-line pb-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={href({ tab: t.key, sort: null })}
            className={`rounded px-2.5 py-1 text-sm ${tab === t.key ? "bg-wash font-semibold text-charcoal" : "text-muted hover:text-accent-deep"}`}
          >
            {t.label}
          </Link>
        ))}
        <form className="ml-auto max-w-[14rem]">
          <input type="hidden" name="tab" value={tab} />
          {platform && <input type="hidden" name="platform" value={platform} />}
          <input type="search" name="q" placeholder="Search this list…" defaultValue={q ?? ""} aria-label="Search digital" />
        </form>
      </div>

      {tab === "talent" && <TalentTab q={q} platform={platform} page={page} sort={sort} />}
      {tab === "formats" && <FormatsTab q={q} platform={platform} page={page} sort={sort} canEdit={canEdit} />}
      {tab === "projects" && <ProjectsTab q={q} page={page} sort={sort} canEdit={canEdit} />}
      {tab === "companies" && <CompaniesTab q={q} page={page} sort={sort} />}
      {tab === "contacts" && <ContactsTab q={q} page={page} sort={sort} />}
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

/** A format counts as digital by its type, or by naming a platform as its target. */
function digitalFormatWhere(platform: string | null): Prisma.FormatWhereInput {
  const words = platform ? [platform] : DIGITAL_WORDS;
  return {
    archived: false,
    OR: [
      ...(platform ? [] : [{ formatType: { in: DIGITAL_FORMAT_TYPES } }]),
      ...words.map((w) => ({ targetPlatform: { contains: w, mode: "insensitive" as const } })),
    ],
  };
}

// --- Tabs --------------------------------------------------------------------

async function TalentTab({
  q,
  platform,
  page,
  sort,
}: {
  q?: string;
  platform: string | null;
  page: number;
  sort: { key: string; desc: boolean };
}) {
  const platforms = platform ? [platform] : [...PLATFORMS];
  const where: Prisma.CreatorWhereInput = {
    archived: false,
    socialProfiles: { some: { platform: { in: platforms }, followerCount: { not: null } } },
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };

  // Ordering by an audience number means ordering by a related row, which
  // Prisma can't do across a filtered relation — so the sort happens here, on
  // the page's worth of rows plus enough headroom to be correct.
  const rows = await db.creator.findMany({
    where,
    orderBy: sort.key === "name" ? { name: sort.desc ? "desc" : "asc" } : { updatedAt: "desc" },
    take: sort.key === "name" ? PAGE_SIZE : 2000,
    skip: sort.key === "name" ? (page - 1) * PAGE_SIZE : 0,
    select: {
      id: true,
      name: true,
      slug: true,
      headline: true,
      socialProfiles: { where: { platform: { in: platforms } }, select: { platform: true, handle: true, url: true, followerCount: true, engagementRate: true, countUpdatedAt: true } },
      entityLinks: { where: { entity: { kind: { in: ["creator_category", "vertical"] } } }, select: { entity: { select: { name: true } } }, take: 3 },
    },
  });
  const total = await db.creator.count({ where });

  const scored = rows.map((c) => {
    const best = [...c.socialProfiles].sort((a, b) => (b.followerCount ?? 0) - (a.followerCount ?? 0))[0];
    return {
      ...c,
      audience: c.socialProfiles.reduce((n, p) => n + (p.followerCount ?? 0), 0),
      best,
    };
  });
  if (sort.key !== "name") {
    scored.sort((a, b) => (sort.desc ? b.audience - a.audience : a.audience - b.audience));
  }
  const shown = sort.key === "name" ? scored : scored.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <RecordTable
        sort={sort}
        empty={q ? "No talent match that." : "No talent have a profile on this platform yet."}
        columns={[
          { label: "Talent", sortKey: "name" },
          { label: platform ? "Handle" : "Biggest account" },
          { label: platform ? "Followers" : "Total audience", sortKey: "audience", align: "right" },
          { label: "Engagement", align: "right", showAt: "hidden sm:table-cell" },
          { label: "Checked", showAt: "hidden md:table-cell" },
          { label: "Focus", showAt: "hidden lg:table-cell" },
        ]}
        rows={shown.map((c) => ({
          id: c.id,
          href: `/talent/${c.slug}`,
          cells: [
            <span key="n">
              {c.name}
              {c.headline && <span className="block text-xs font-normal text-muted line-clamp-1">{c.headline}</span>}
            </span>,
            <span key="h" className="text-muted">
              {/* Plenty of records carry a follower count with no handle yet;
                  naming the platform and then a dash reads worse than the
                  platform on its own. */}
              {c.best ? (
                <>
                  {!platform && <span className={c.best.handle ? "text-faint" : ""}>{socialLabel(c.best.platform)}</span>}
                  {c.best.handle ? (
                    <>
                      {!platform && " "}
                      {c.best.url ? (
                        <a href={c.best.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-accent">
                          {c.best.handle}
                        </a>
                      ) : (
                        c.best.handle
                      )}
                    </>
                  ) : (
                    platform && <span className="text-faint">—</span>
                  )}
                </>
              ) : (
                <span className="text-faint">—</span>
              )}
            </span>,
            <span key="a" className="tabular-nums font-medium">{compactNumber(c.audience)}</span>,
            <span key="e" className="tabular-nums text-muted">
              {c.best?.engagementRate != null ? `${c.best.engagementRate.toFixed(2)}%` : <span className="text-faint">—</span>}
            </span>,
            <span key="u" className="whitespace-nowrap text-muted">
              {c.best?.countUpdatedAt ? relativeTime(c.best.countUpdatedAt) : <span className="text-faint">never</span>}
            </span>,
            <span key="c" className="line-clamp-1 text-muted">
              {c.entityLinks.map((l) => l.entity.name).join(", ") || <span className="text-faint">—</span>}
            </span>,
          ],
        }))}
      />
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} />
    </>
  );
}

async function FormatsTab({
  q,
  platform,
  page,
  sort,
  canEdit,
}: {
  q?: string;
  platform: string | null;
  page: number;
  sort: { key: string; desc: boolean };
  canEdit: boolean;
}) {
  const base = digitalFormatWhere(platform);
  const where: Prisma.FormatWhereInput = q ? { AND: [base, { title: { contains: q, mode: "insensitive" } }] } : base;
  const [formats, total] = await Promise.all([
    db.format.findMany({
      where,
      orderBy: sort.key === "title" ? { title: sort.desc ? "desc" : "asc" } : [{ lastActivityAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { creators: { include: { creator: { select: { name: true } } }, take: 3 } },
    }),
    db.format.count({ where }),
  ]);

  return (
    <>
      <RecordTable
        sort={sort}
        empty="No digital formats yet."
        columns={[
          { label: "Format", sortKey: "title" },
          { label: "Status", sortKey: "status" },
          { label: "Target platform" },
          { label: "Type", showAt: "hidden sm:table-cell" },
          { label: "Talent", showAt: "hidden md:table-cell" },
          { label: "Last activity", sortKey: "date", showAt: "hidden lg:table-cell" },
        ]}
        rows={formats.map((f) => ({
          id: f.id,
          href: `/formats/${f.slug}`,
          cells: [
            <span key="t">
              {f.title}
              {f.logline && <span className="block text-xs font-normal text-muted line-clamp-1">{f.logline}</span>}
            </span>,
            <RowStatus key="s" type="format" id={f.id} status={f.status} name={f.title} canEdit={canEdit} />,
            <span key="p" className="text-muted">{f.targetPlatform ?? <span className="text-faint">—</span>}</span>,
            <span key="ty" className="text-muted">{labelFor(f.formatType)}</span>,
            <span key="c" className="line-clamp-1 text-muted">{f.creators.map((c) => c.creator.name).join(", ") || <span className="text-faint">—</span>}</span>,
            <span key="d" className="whitespace-nowrap text-muted">{f.lastActivityAt ? formatDate(f.lastActivityAt) : <span className="text-faint">—</span>}</span>,
          ],
        }))}
      />
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} />
    </>
  );
}

async function ProjectsTab({
  q,
  page,
  sort,
  canEdit,
}: {
  q?: string;
  page: number;
  sort: { key: string; desc: boolean };
  canEdit: boolean;
}) {
  const where: Prisma.ProjectWhereInput = {
    archived: false,
    projectType: { in: DIGITAL_PROJECT_TYPES },
    ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
  };
  const [projects, total] = await Promise.all([
    db.project.findMany({
      where,
      orderBy: sort.key === "title" ? { title: sort.desc ? "desc" : "asc" } : [{ lastActivityAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        credits: { include: { creator: { select: { name: true } } } },
        organizations: { include: { organization: { select: { name: true } } } },
      },
    }),
    db.project.count({ where }),
  ]);

  return (
    <>
      <RecordTable
        sort={sort}
        empty="No digital-native projects yet."
        columns={[
          { label: "Project", sortKey: "title" },
          { label: "Status", sortKey: "status" },
          { label: "Type", showAt: "hidden sm:table-cell" },
          { label: "Talent", showAt: "hidden md:table-cell" },
          { label: "Companies", showAt: "hidden lg:table-cell" },
          { label: "Year", align: "right", showAt: "hidden sm:table-cell" },
        ]}
        rows={projects.map((p) => ({
          id: p.id,
          href: `/projects/${p.slug}`,
          cells: [
            <span key="t">{p.title}</span>,
            <RowStatus key="s" type="project" id={p.id} status={p.status} name={p.title} canEdit={canEdit} />,
            <span key="ty" className="text-muted">{labelFor(p.projectType)}</span>,
            <span key="c" className="line-clamp-1 text-muted">{[...new Set(p.credits.map((c) => c.creator.name))].join(", ") || <span className="text-faint">—</span>}</span>,
            <span key="o" className="line-clamp-1 text-muted">{[...new Set(p.organizations.map((o) => o.organization.name))].join(", ") || <span className="text-faint">—</span>}</span>,
            <span key="y" className="tabular-nums text-muted">{p.premiereYear ?? <span className="text-faint">—</span>}</span>,
          ],
        }))}
      />
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} />
    </>
  );
}

async function CompaniesTab({ q, page, sort }: { q?: string; page: number; sort: { key: string; desc: boolean } }) {
  const where: Prisma.OrganizationWhereInput = {
    archived: false,
    types: { hasSome: DIGITAL_ORG_TYPES },
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };
  const [orgs, total] = await Promise.all([
    db.organization.findMany({
      where,
      orderBy: sort.key === "name" && !sort.desc ? { name: "asc" } : sort.key === "name" ? { name: "desc" } : { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { people: true, creators: true, formats: true, projects: true } } },
    }),
    db.organization.count({ where }),
  ]);

  return (
    <>
      <RecordTable
        sort={sort}
        empty="No digital platforms or companies yet."
        columns={[
          { label: "Company", sortKey: "name" },
          { label: "What it is" },
          { label: "Location", showAt: "hidden sm:table-cell" },
          { label: "Contacts", align: "right", showAt: "hidden md:table-cell" },
          { label: "Formats", align: "right", showAt: "hidden md:table-cell" },
          { label: "Projects", align: "right", showAt: "hidden lg:table-cell" },
        ]}
        rows={orgs.map((o) => ({
          id: o.id,
          href: `/organizations/${o.slug}`,
          cells: [
            <span key="n">{o.name}</span>,
            <span key="t" className="line-clamp-1 text-muted">{o.types.map(labelFor).join(", ")}</span>,
            <span key="l" className="text-muted">{o.location ?? <span className="text-faint">—</span>}</span>,
            <span key="p" className="tabular-nums text-muted">{o._count.people || <span className="text-faint">—</span>}</span>,
            <span key="f" className="tabular-nums text-muted">{o._count.formats || <span className="text-faint">—</span>}</span>,
            <span key="pr" className="tabular-nums text-muted">{o._count.projects || <span className="text-faint">—</span>}</span>,
          ],
        }))}
      />
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} />
    </>
  );
}

async function ContactsTab({ q, page, sort }: { q?: string; page: number; sort: { key: string; desc: boolean } }) {
  const where: Prisma.IndustryPersonWhereInput = {
    archived: false,
    organizations: { some: { organization: { types: { hasSome: DIGITAL_ORG_TYPES } } } },
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };
  const [people, total] = await Promise.all([
    db.industryPerson.findMany({
      where,
      orderBy: sort.key === "name" ? { name: sort.desc ? "desc" : "asc" } : { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { organizations: { include: { organization: { select: { name: true, types: true } } } } },
    }),
    db.industryPerson.count({ where }),
  ]);

  return (
    <>
      <RecordTable
        sort={sort}
        empty="No contacts at digital companies yet."
        columns={[
          { label: "Name", sortKey: "name" },
          { label: "Title" },
          { label: "Company", showAt: "hidden sm:table-cell" },
          { label: "Role", showAt: "hidden md:table-cell" },
          { label: "Email", showAt: "hidden lg:table-cell" },
        ]}
        rows={people.map((p) => ({
          id: p.id,
          href: `/people/${p.slug}`,
          cells: [
            <span key="n">{p.name}</span>,
            <span key="t" className="line-clamp-1 text-muted">{p.title ?? <span className="text-faint">—</span>}</span>,
            <span key="o" className="line-clamp-1 text-muted">
              {p.organizations
                .filter((x) => x.organization.types.some((t) => DIGITAL_ORG_TYPES.includes(t)))
                .map((x) => x.organization.name)
                .join(", ")}
            </span>,
            <span key="r" className="text-muted">{labelFor(p.roleType) || <span className="text-faint">—</span>}</span>,
            <span key="e" className="line-clamp-1 text-muted">{p.email ?? <span className="text-faint">—</span>}</span>,
          ],
        }))}
      />
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} />
    </>
  );
}
