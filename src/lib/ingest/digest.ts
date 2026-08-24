// Note: intentionally no "server-only" guard — the rebuild script runs this
// under tsx outside Next. It is only ever imported by server code.
import { db } from "@/lib/db";
import { labelFor, socialLabel } from "@/lib/taxonomy";
import { compactNumber, totalAudience } from "@/lib/format";
import { RECORD_REGISTRY, type IngestTargetType } from "@/lib/ingest/registry";

// Knowledge Digest generator. Each canonical record gets one compact
// plain-text dossier row so the model can reason with the context of what is
// already in the database — without ever being sent the database.

const SUMMARY_CAP = 700; // slight headroom over the 600-char target
const LINE_CAP = 110;

const clip = (value: string, cap = LINE_CAP) =>
  value.length > cap ? `${value.slice(0, cap - 1)}…` : value;

type DigestData = {
  slug: string;
  name: string;
  aliases: string[];
  archived: boolean;
  summary: string;
  searchText: string;
  sourceVersion: number;
  path: string;
};

function assemble(lines: (string | null | undefined)[], searchParts: string[]): {
  summary: string;
  searchText: string;
} {
  let summary = lines.filter(Boolean).map((l) => clip(l!)).join("\n");
  if (summary.length > SUMMARY_CAP) summary = `${summary.slice(0, SUMMARY_CAP - 1)}…`;
  const searchText = [...new Set(searchParts.map((p) => p.trim()).filter(Boolean))]
    .join(" | ")
    .slice(0, 6000);
  return { summary, searchText };
}

async function buildCreatorDigest(id: string): Promise<DigestData | null> {
  const c = await db.creator.findUnique({
    where: { id },
    include: {
      socialProfiles: true,
      entityLinks: { include: { entity: { select: { kind: true, name: true } } } },
      credits: { include: { project: { select: { title: true } } } },
      formats: { include: { format: { select: { title: true } } } },
      organizations: { include: { organization: { select: { name: true } } } },
      people: { include: { person: { select: { name: true } } } },
    },
  });
  if (!c) return null;
  const byKind = (k: string) => c.entityLinks.filter((l) => l.entity.kind === k).map((l) => l.entity.name);
  const basedIn = c.entityLinks.find((l) => l.entity.kind === "location" && l.relationship === "based_in")?.entity.name;
  const projects = new Map<string, string[]>();
  for (const cr of c.credits) {
    (projects.get(cr.project.title) ?? projects.set(cr.project.title, []).get(cr.project.title)!).push(labelFor(cr.role));
  }
  const { summary, searchText } = assemble(
    [
      `TALENT — ${c.name}${c.status !== "active" ? ` [${c.status}]` : ""}${c.archived ? " [ARCHIVED]" : ""}`,
      c.headline,
      [c.age ? `${c.age}` : null, basedIn ? `Based in ${basedIn}` : null, `${compactNumber(totalAudience(c.socialProfiles))} audience`].filter(Boolean).join(" · "),
      byKind("creator_category").length ? `Types: ${byKind("creator_category").join(", ")}` : null,
      [...byKind("sport"), ...byKind("interest"), ...byKind("hobby")].length
        ? `Interests: ${[...byKind("sport"), ...byKind("interest"), ...byKind("hobby")].join(", ")}`
        : null,
      projects.size ? `Projects: ${[...projects.entries()].map(([t, r]) => `${t} (${r.join("/")})`).join("; ")}` : null,
      c.formats.length ? `Formats: ${c.formats.map((f) => f.format.title).join(", ")}` : null,
      c.organizations.length ? `Orgs: ${c.organizations.map((o) => `${o.organization.name} (${labelFor(o.relationship)})`).join("; ")}` : null,
      c.people.length ? `Rep: ${c.people.map((p) => `${p.person.name} (${labelFor(p.relationship)}${p.current ? "" : ", past"})`).join("; ")}` : null,
    ],
    [
      c.name, ...c.aliases,
      ...c.socialProfiles.flatMap((s) => [s.handle ?? "", `${socialLabel(s.platform)} ${s.handle ?? ""}`]),
      ...c.entityLinks.map((l) => l.entity.name),
      ...[...projects.keys()],
      ...c.formats.map((f) => f.format.title),
      ...c.organizations.map((o) => o.organization.name),
      ...c.people.map((p) => p.person.name),
    ],
  );
  return { slug: c.slug, name: c.name, aliases: c.aliases, archived: c.archived, summary, searchText, sourceVersion: c.version, path: `/talent/${c.slug}` };
}

async function buildProjectDigest(id: string): Promise<DigestData | null> {
  const p = await db.project.findUnique({
    where: { id },
    include: {
      credits: { include: { creator: { select: { name: true } } } },
      organizations: { include: { organization: { select: { name: true } } } },
      entityLinks: { include: { entity: { select: { name: true } } } },
      people: { include: { person: { select: { name: true } } } },
    },
  });
  if (!p) return null;
  const talent = new Map<string, string[]>();
  for (const cr of p.credits) {
    (talent.get(cr.creator.name) ?? talent.set(cr.creator.name, []).get(cr.creator.name)!).push(labelFor(cr.role));
  }
  const { summary, searchText } = assemble(
    [
      `PROJECT — ${p.title} [${labelFor(p.status)}]${p.archived ? " [ARCHIVED]" : ""}`,
      [labelFor(p.projectType), p.premiereYear, p.seasons ? `${p.seasons} seasons` : null].filter(Boolean).join(" · "),
      p.logline,
      talent.size ? `Talent: ${[...talent.entries()].map(([n, r]) => `${n} (${r.join("/")})`).join("; ")}` : null,
      p.organizations.length ? `Companies: ${p.organizations.map((o) => `${o.organization.name} (${labelFor(o.relationship)})`).join("; ")}` : null,
      p.people.length ? `Credits: ${p.people.map((x) => `${x.person.name} (${labelFor(x.role)})`).join("; ")}` : null,
      p.entityLinks.length ? `Topics: ${p.entityLinks.map((l) => l.entity.name).join(", ")}` : null,
    ],
    [
      p.title, ...p.aliases,
      ...[...talent.keys()],
      ...p.organizations.map((o) => o.organization.name),
      ...p.people.map((x) => x.person.name),
      ...p.entityLinks.map((l) => l.entity.name),
    ],
  );
  return { slug: p.slug, name: p.title, aliases: p.aliases, archived: p.archived, summary, searchText, sourceVersion: p.version, path: `/projects/${p.slug}` };
}

async function buildOrganizationDigest(id: string): Promise<DigestData | null> {
  const o = await db.organization.findUnique({
    where: { id },
    include: {
      projects: { include: { project: { select: { title: true } } }, take: 12 },
      creators: { include: { creator: { select: { name: true } } }, take: 12 },
      people: { include: { person: { select: { name: true } } }, take: 8 },
      formats: { include: { format: { select: { title: true } } }, take: 8 },
    },
  });
  if (!o) return null;
  const { summary, searchText } = assemble(
    [
      `ORGANIZATION — ${o.name} [${o.types.map(labelFor).join(", ") || "org"}]${o.archived ? " [ARCHIVED]" : ""}`,
      o.location,
      o.description,
      o.projects.length ? `Projects: ${o.projects.map((p) => `${p.project.title} (${labelFor(p.relationship)})`).join("; ")}` : null,
      o.creators.length ? `Talent: ${o.creators.map((c) => `${c.creator.name} (${labelFor(c.relationship)})`).join("; ")}` : null,
      o.people.length ? `People: ${o.people.map((p) => p.person.name).join(", ")}` : null,
      o.formats.length ? `Formats: ${o.formats.map((f) => f.format.title).join(", ")}` : null,
    ],
    [
      o.name, ...o.aliases, o.website ?? "",
      ...o.projects.map((p) => p.project.title),
      ...o.creators.map((c) => c.creator.name),
      ...o.people.map((p) => p.person.name),
    ],
  );
  return { slug: o.slug, name: o.name, aliases: o.aliases, archived: o.archived, summary, searchText, sourceVersion: o.version, path: `/organizations/${o.slug}` };
}

async function buildFormatDigest(id: string): Promise<DigestData | null> {
  const f = await db.format.findUnique({
    where: { id },
    include: {
      creators: { include: { creator: { select: { name: true } } } },
      entityLinks: { include: { entity: { select: { name: true } } } },
      organizations: { include: { organization: { select: { name: true } } } },
    },
  });
  if (!f) return null;
  const { summary, searchText } = assemble(
    [
      `FORMAT (internal 4.4.Forty concept) — ${f.title} [${labelFor(f.status)}]${f.archived ? " [ARCHIVED]" : ""}`,
      f.logline,
      f.creators.length ? `Talent: ${f.creators.map((c) => c.creator.name).join(", ")}` : null,
      f.entityLinks.length ? `Topics: ${f.entityLinks.map((l) => l.entity.name).join(", ")}` : null,
      f.organizations.length ? `Orgs: ${f.organizations.map((o) => `${o.organization.name} (${labelFor(o.relationship)})`).join("; ")}` : null,
    ],
    [f.title, ...f.creators.map((c) => c.creator.name), ...f.entityLinks.map((l) => l.entity.name), ...f.organizations.map((o) => o.organization.name)],
  );
  return { slug: f.slug, name: f.title, aliases: [], archived: f.archived, summary, searchText, sourceVersion: f.version, path: `/formats/${f.slug}` };
}

async function buildPersonDigest(id: string): Promise<DigestData | null> {
  const p = await db.industryPerson.findUnique({
    where: { id },
    include: {
      organizations: { include: { organization: { select: { name: true } } } },
      creators: { include: { creator: { select: { name: true } } } },
      projects: { include: { project: { select: { title: true } } } },
    },
  });
  if (!p) return null;
  const { summary, searchText } = assemble(
    [
      `INDUSTRY PERSON — ${p.name}${p.archived ? " [ARCHIVED]" : ""}`,
      [p.title, labelFor(p.roleType), p.organizations[0]?.organization.name].filter(Boolean).join(" · "),
      [p.email, p.phone].filter(Boolean).length ? `Contact: ${[p.email, p.phone].filter(Boolean).join(" · ")}` : null,
      p.assistantName || p.assistantEmail ? `Assistant: ${[p.assistantName, p.assistantEmail].filter(Boolean).join(" — ")}` : null,
      p.creators.length ? `Represents/connected: ${p.creators.map((c) => `${c.creator.name} (${labelFor(c.relationship)}${c.current ? "" : ", past"})`).join("; ")}` : null,
      p.projects.length ? `Projects: ${p.projects.map((x) => `${x.project.title} (${labelFor(x.role)})`).join("; ")}` : null,
    ],
    [p.name, p.email ?? "", p.phone ?? "", ...p.organizations.map((o) => o.organization.name), ...p.creators.map((c) => c.creator.name), ...p.projects.map((x) => x.project.title)],
  );
  return { slug: p.slug, name: p.name, aliases: [], archived: p.archived, summary, searchText, sourceVersion: 0, path: `/people/${p.slug}` };
}

async function buildOpportunityDigest(id: string): Promise<DigestData | null> {
  const o = await db.opportunity.findUnique({
    where: { id },
    include: {
      entityLinks: { include: { entity: { select: { name: true } } } },
      creators: { include: { creator: { select: { name: true } } } },
      organizations: { include: { organization: { select: { name: true } } } },
    },
  });
  if (!o) return null;
  const { summary, searchText } = assemble(
    [
      `OPPORTUNITY — ${o.title} [${labelFor(o.status)}]${o.archived ? " [ARCHIVED]" : ""}`,
      labelFor(o.type),
      o.description,
      o.entityLinks.length ? `Criteria: ${o.entityLinks.map((l) => l.entity.name).join(", ")}` : null,
      o.creators.length ? `Talent considered: ${o.creators.map((c) => c.creator.name).join(", ")}` : null,
      o.organizations.length ? `Orgs: ${o.organizations.map((x) => x.organization.name).join(", ")}` : null,
    ],
    [o.title, ...o.entityLinks.map((l) => l.entity.name), ...o.creators.map((c) => c.creator.name), ...o.organizations.map((x) => x.organization.name)],
  );
  return { slug: o.slug, name: o.title, aliases: [], archived: o.archived, summary, searchText, sourceVersion: o.version, path: `/opportunities/${o.slug}` };
}

async function buildEntityDigest(id: string): Promise<DigestData | null> {
  const e = await db.entity.findUnique({
    where: { id },
    include: {
      _count: { select: { creatorLinks: true, projectLinks: true, formatLinks: true } },
    },
  });
  if (!e) return null;
  const { summary, searchText } = assemble(
    [
      `${labelFor(e.kind).toUpperCase()} (taxonomy) — ${e.name}`,
      `${e._count.creatorLinks} talent · ${e._count.projectLinks} projects · ${e._count.formatLinks} formats`,
    ],
    [e.name, ...e.aliases, e.kind],
  );
  return { slug: e.slug, name: e.name, aliases: e.aliases, archived: false, summary, searchText, sourceVersion: 0, path: `/explore/${e.kind}/${e.slug}` };
}

async function buildEventDigest(id: string): Promise<DigestData | null> {
  const ev = await db.sportsEvent.findUnique({
    where: { id },
    include: { sport: { select: { name: true } } },
  });
  if (!ev) return null;
  const { summary, searchText } = assemble(
    [
      `SPORTS EVENT — ${ev.title}`,
      [ev.sport?.name, ev.league, ev.location, ev.startDate.toISOString().slice(0, 10)].filter(Boolean).join(" · "),
    ],
    [ev.title, ev.league ?? "", ev.sport?.name ?? "", ev.location ?? ""],
  );
  return { slug: ev.slug, name: ev.title, aliases: [], archived: false, summary, searchText, sourceVersion: 0, path: `/calendar` };
}

const BUILDERS: Record<IngestTargetType, (id: string) => Promise<DigestData | null>> = {
  creator: buildCreatorDigest,
  project: buildProjectDigest,
  organization: buildOrganizationDigest,
  format: buildFormatDigest,
  person: buildPersonDigest,
  opportunity: buildOpportunityDigest,
  entity: buildEntityDigest,
  event: buildEventDigest,
};

export function isDigestible(targetType: string): targetType is IngestTargetType {
  return targetType in BUILDERS;
}

// Collapse rapid repeat refreshes of the same record (e.g. one apply touching
// a record ten times) on a warm instance. Harmless when cold.
const recentRefreshes = new Map<string, number>();
const REFRESH_TTL_MS = 2000;

/** Rebuild the digest row for one record. Safe to call from any mutation path. */
export async function refreshDigest(targetType: string, targetId: string): Promise<void> {
  if (!isDigestible(targetType) || !targetId) return;
  const key = `${targetType}:${targetId}`;
  const last = recentRefreshes.get(key);
  const now = Date.now();
  if (last && now - last < REFRESH_TTL_MS) return;
  recentRefreshes.set(key, now);
  if (recentRefreshes.size > 500) recentRefreshes.clear();

  try {
    const data = await BUILDERS[targetType](targetId);
    if (!data) {
      await db.knowledgeDigest.deleteMany({ where: { targetType, targetId } });
      return;
    }
    await db.knowledgeDigest.upsert({
      where: { targetType_targetId: { targetType, targetId } },
      update: {
        slug: data.slug, name: data.name, aliases: data.aliases, archived: data.archived,
        summary: data.summary, searchText: data.searchText, sourceVersion: data.sourceVersion,
      },
      create: {
        targetType, targetId,
        slug: data.slug, name: data.name, aliases: data.aliases, archived: data.archived,
        summary: data.summary, searchText: data.searchText, sourceVersion: data.sourceVersion,
      },
    });
  } catch (e) {
    // A digest failure must never break the mutation that triggered it.
    console.error(`Digest refresh failed for ${key}:`, e);
  }
}

/** Test hook: clear the TTL memo so refreshes in quick succession all run. */
export function clearDigestMemo() {
  recentRefreshes.clear();
}

export async function rebuildAllDigests(): Promise<{ built: number; removed: number }> {
  let built = 0;
  const seen = new Set<string>();
  for (const targetType of Object.keys(BUILDERS) as IngestTargetType[]) {
    const spec = RECORD_REGISTRY[targetType];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: { id: string }[] = await (db as any)[spec.prismaModel].findMany({ select: { id: true } });
    for (const row of rows) {
      clearDigestMemo();
      await refreshDigest(targetType, row.id);
      seen.add(`${targetType}:${row.id}`);
      built++;
    }
  }
  // Remove digests whose records no longer exist
  const all = await db.knowledgeDigest.findMany({ select: { id: true, targetType: true, targetId: true } });
  const stale = all.filter((d) => !seen.has(`${d.targetType}:${d.targetId}`));
  if (stale.length) {
    await db.knowledgeDigest.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }
  return { built, removed: stale.length };
}
