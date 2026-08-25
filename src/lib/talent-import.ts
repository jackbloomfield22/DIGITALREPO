// Tolerant talent-spreadsheet parsing. Exports from tools like CreatorIQ never
// match our column names exactly — they use their own headers ("Creator Name",
// "IG Followers", "Eng. Rate"), abbreviate counts ("1.61M", "646.95K"), and
// sometimes give one row per creator-per-network instead of one row per
// creator. This module turns any of those shapes into clean talent records.
//
// Pure functions only: no database, no request context — so the import action,
// scripts, and tests all share exactly the same interpretation of a file.

export type ParsedSocial = {
  platform: string;
  handle?: string;
  url?: string;
  followerCount?: number;
  engagementRate?: number;
};

export type ParsedTalent = {
  name: string;
  headline?: string;
  miniBio?: string;
  age?: number;
  basedIn?: string;
  categories: string[];
  interests: string[];
  sports: string[];
  socials: ParsedSocial[];
};

/** Header text → comparison key: "Eng. Rate (IG)" → "engrateig". */
const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

const FIELD_ALIASES: Record<string, string[]> = {
  name: ["name", "creator", "creatorname", "talent", "talentname", "fullname", "displayname", "profilename"],
  headline: ["headline", "tagline", "oneliner", "shortdescription"],
  miniBio: ["minibio", "bio", "biography", "description", "about", "summary"],
  age: ["age"],
  basedIn: ["basedin", "location", "city", "market", "based", "hometown", "country"],
  categories: ["categories", "category", "talenttype", "talenttypes", "vertical", "verticals", "contentcategory", "contentcategories", "niche"],
  interests: ["interests", "interest", "topics", "topic", "tags"],
  sports: ["sports", "sport"],
};

// Long-format (one row per creator-per-network) columns.
const PLATFORM_COL = ["platform", "network", "channel", "socialnetwork", "socialplatform"];
const HANDLE_COL = ["handle", "username", "socialhandle", "screenname", "accounthandle", "account"];
const FOLLOWERS_COL = ["followers", "followercount", "followers", "audience", "subscribers", "subs", "totalfollowers", "reach", "audiencesize"];
const ENGAGEMENT_COL = ["engagementrate", "engrate", "engagement", "er", "avgengagementrate", "averageengagementrate"];
const URL_COL = ["url", "profileurl", "link", "profilelink", "channelurl"];

/** Platform aliases → canonical platform slug used by SocialProfile. */
const PLATFORMS: Record<string, string[]> = {
  instagram: ["instagram", "ig", "insta"],
  tiktok: ["tiktok", "tt", "tikok"],
  youtube: ["youtube", "yt", "ytshorts"],
  x: ["x", "twitter"],
  twitch: ["twitch"],
  facebook: ["facebook", "fb"],
  snapchat: ["snapchat", "snap"],
  linkedin: ["linkedin"],
};

const METRIC_SUFFIXES: Record<string, string[]> = {
  handle: HANDLE_COL,
  followers: FOLLOWERS_COL,
  engagement: ENGAGEMENT_COL,
  url: URL_COL,
};

export function canonicalPlatform(raw: string): string | null {
  const k = key(raw);
  for (const [platform, aliases] of Object.entries(PLATFORMS)) {
    if (aliases.includes(k)) return platform;
  }
  return k ? k : null;
}

/** "1.61M" → 1610000, "646.95K" → 646950, "1,610,000" → 1610000, "—" → undefined. */
export function parseCount(raw?: string): number | undefined {
  if (!raw) return undefined;
  const text = raw.trim().replace(/,/g, "").replace(/\s/g, "");
  if (!text || /^[-–—n\/a]+$/i.test(text)) return undefined;
  const m = text.match(/^([\d.]+)\s*([kmb])?$/i);
  if (!m) return undefined;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return undefined;
  const mult = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[(m[2] ?? "").toLowerCase()] ?? 1;
  return Math.round(value * mult);
}

/** "4.47%" → 4.47, "0.0447" → 4.47 (bare fractions are read as rates). */
export function parsePercent(raw?: string): number | undefined {
  if (!raw) return undefined;
  const text = raw.trim();
  if (!text || /^[-–—n\/a]+$/i.test(text)) return undefined;
  const hadSign = text.includes("%");
  const value = Number(text.replace(/[%\s,]/g, ""));
  if (!Number.isFinite(value)) return undefined;
  if (!hadSign && value > 0 && value <= 1) return Math.round(value * 10000) / 100;
  return Math.round(value * 100) / 100;
}

const splitList = (raw?: string) =>
  (raw ?? "")
    .split(/[;|/,]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Find the first value whose header matches one of `aliases`. */
function pick(row: Record<string, string>, aliases: string[]): string | undefined {
  for (const [header, value] of Object.entries(row)) {
    if (aliases.includes(key(header)) && value?.trim()) return value.trim();
  }
  return undefined;
}

/**
 * Wide-format socials: columns that name a platform and a metric in either
 * order — "instagram_followers", "IG Handle", "Eng. Rate (TikTok)".
 */
function wideSocials(row: Record<string, string>): ParsedSocial[] {
  const found = new Map<string, ParsedSocial>();
  for (const [header, rawValue] of Object.entries(row)) {
    const value = rawValue?.trim();
    if (!value) continue;
    const k = key(header);
    for (const [platform, pAliases] of Object.entries(PLATFORMS)) {
      const alias = pAliases.find((a) => k.startsWith(a) || k.endsWith(a));
      if (!alias) continue;
      const rest = k.startsWith(alias) ? k.slice(alias.length) : k.slice(0, k.length - alias.length);
      if (!rest) continue; // a bare "instagram" column is handled as a handle below
      const metric = Object.entries(METRIC_SUFFIXES).find(([, aliases]) => aliases.includes(rest))?.[0];
      if (!metric) continue;
      const social = found.get(platform) ?? { platform };
      if (metric === "handle") social.handle = value.replace(/^@/, "");
      else if (metric === "followers") social.followerCount = parseCount(value);
      else if (metric === "engagement") social.engagementRate = parsePercent(value);
      else if (metric === "url") social.url = value;
      found.set(platform, social);
      break;
    }
  }
  return [...found.values()];
}

/** Long-format socials: a platform column plus metric columns on the same row. */
function longSocial(row: Record<string, string>): ParsedSocial | null {
  const platformRaw = pick(row, PLATFORM_COL);
  if (!platformRaw) return null;
  const platform = canonicalPlatform(platformRaw);
  if (!platform) return null;
  return {
    platform,
    handle: pick(row, HANDLE_COL)?.replace(/^@/, ""),
    url: pick(row, URL_COL),
    followerCount: parseCount(pick(row, FOLLOWERS_COL)),
    engagementRate: parsePercent(pick(row, ENGAGEMENT_COL)),
  };
}

const mergeSocial = (into: ParsedSocial, from: ParsedSocial) => {
  into.handle ??= from.handle;
  into.url ??= from.url;
  if (from.followerCount != null) into.followerCount = from.followerCount;
  if (from.engagementRate != null) into.engagementRate = from.engagementRate;
};

/**
 * Turn raw spreadsheet rows into talent records. Rows sharing a name are
 * merged, so a per-network export collapses into one profile per creator.
 */
export function normalizeTalentRows(rows: Record<string, string>[]): ParsedTalent[] {
  const byName = new Map<string, ParsedTalent>();

  for (const row of rows) {
    const name = pick(row, FIELD_ALIASES.name);
    if (!name) continue;
    const nameKey = name.toLowerCase().replace(/\s+/g, " ");

    const talent: ParsedTalent = byName.get(nameKey) ?? {
      name,
      categories: [],
      interests: [],
      sports: [],
      socials: [],
    };

    talent.headline ??= pick(row, FIELD_ALIASES.headline);
    talent.miniBio ??= pick(row, FIELD_ALIASES.miniBio);
    talent.basedIn ??= pick(row, FIELD_ALIASES.basedIn);
    const age = Number(pick(row, FIELD_ALIASES.age));
    if (!talent.age && Number.isFinite(age) && age > 0 && age < 120) talent.age = Math.round(age);

    for (const [field, list] of [
      ["categories", splitList(pick(row, FIELD_ALIASES.categories))],
      ["interests", splitList(pick(row, FIELD_ALIASES.interests))],
      ["sports", splitList(pick(row, FIELD_ALIASES.sports))],
    ] as const) {
      for (const value of list) if (!talent[field].includes(value)) talent[field].push(value);
    }

    const incoming = [...wideSocials(row)];
    const long = longSocial(row);
    if (long) incoming.push(long);
    for (const social of incoming) {
      if (social.followerCount == null && social.engagementRate == null && !social.handle && !social.url) continue;
      const existing = talent.socials.find((s) => s.platform === social.platform);
      if (existing) mergeSocial(existing, social);
      else talent.socials.push(social);
    }

    byName.set(nameKey, talent);
  }

  return [...byName.values()];
}
