// Canonical vocabulary for the Digital Bible. Values are stored as snake_case
// strings in the database; labels are how they render in the UI. Adding a new
// value here is all that's needed to extend the vocabulary — no migration.

export type LabeledValue = { value: string; label: string };

const label = (value: string) =>
  value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const mk = (values: string[]): LabeledValue[] =>
  values.map((value) => ({ value, label: label(value) }));

export const labelFor = (value: string | null | undefined): string =>
  value ? label(value) : "";

// --- Entity taxonomy kinds ---------------------------------------------------

export const ENTITY_KINDS = [
  "interest",
  "hobby",
  "sport",
  "location",
  "genre",
  "creator_category",
  "skill",
  "vertical",
  "audience_type",
  "tag",
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  interest: "Interest",
  hobby: "Hobby",
  sport: "Sport",
  location: "Location",
  genre: "Genre",
  creator_category: "Creator Category",
  skill: "Skill",
  vertical: "Content Vertical",
  audience_type: "Audience Type",
  tag: "Tag",
};

export const ENTITY_KIND_PLURALS: Record<EntityKind, string> = {
  interest: "Interests",
  hobby: "Hobbies",
  sport: "Sports",
  location: "Locations",
  genre: "Genres",
  creator_category: "Creator Categories",
  skill: "Skills",
  vertical: "Content Verticals",
  audience_type: "Audience Types",
  tag: "Tags",
};

// --- Creator ↔ Project roles -------------------------------------------------

export const PROJECT_ROLES = mk([
  "host",
  "co_host",
  "star",
  "subject",
  "cast",
  "contestant",
  "participant",
  "guest",
  "recurring_guest",
  "creator",
  "executive_producer",
  "producer",
  "director",
  "writer",
  "voice_talent",
  "correspondent",
  "founder",
  "owner",
  "other",
]);

// Roles that count as "hosting experience" for derived experience signals.
export const HOSTING_ROLES = ["host", "co_host"];

// --- Project types & status --------------------------------------------------

export const PROJECT_TYPES = mk([
  "tv_series",
  "documentary",
  "docuseries",
  "youtube_series",
  "digital_franchise",
  "podcast",
  "livestream",
  "film",
  "reality_series",
  "competition_show",
  "branded_series",
  "short_form_series",
  "social_franchise",
  "special",
  "other",
]);

export const PROJECT_STATUSES = mk([
  "announced",
  "in_production",
  "airing",
  "released",
  "ended",
  "cancelled",
]);

// --- Organizations -----------------------------------------------------------

export const ORG_TYPES = mk([
  "production_company",
  "studio",
  "network",
  "streamer",
  "digital_platform",
  "brand",
  "agency",
  "management_company",
  "creator_owned_company",
  "investment_firm",
  "startup",
  "podcast_company",
  "publisher",
  "sports_team",
  "sports_league",
  "nonprofit",
  "other",
]);

export const PROJECT_ORG_RELATIONSHIPS = mk([
  "production_company",
  "co_production_company",
  "studio",
  "network",
  "streamer",
  "distributor",
  "financier",
  "brand_partner",
  "sponsor",
  "agency",
  "rights_holder",
  "publisher",
  "platform",
]);

export const CREATOR_ORG_RELATIONSHIPS = mk([
  "ambassador",
  "campaign",
  "sponsored_content",
  "partner",
  "advisor",
  "investor",
  "founder",
  "owner",
  "athlete",
  "collaboration",
  "team_member",
  "other",
]);

// --- People ------------------------------------------------------------------

export const PERSON_ROLE_TYPES = mk([
  "agent",
  "manager",
  "publicist",
  "producer",
  "executive",
  "director",
  "showrunner",
  "attorney",
  "other",
]);

export const CREATOR_PERSON_RELATIONSHIPS = mk([
  "agent",
  "manager",
  "publicist",
  "attorney",
  "producer",
  "other",
]);

export const PERSON_PROJECT_ROLES = mk([
  "director",
  "showrunner",
  "executive_producer",
  "producer",
  "creator",
  "writer",
  "other",
]);

// --- Creator ↔ Creator -------------------------------------------------------

export const CREATOR_RELATIONSHIPS = mk([
  "collaborated_with",
  "co_host",
  "business_partner",
  "teammate",
  "co_star",
  "recurring_content_partner",
  "podcasted_with",
  "family",
  "other",
]);

// --- Formats -----------------------------------------------------------------

export const FORMAT_STATUSES = mk([
  "idea",
  "concept",
  "developing",
  "outbound",
  "pitched",
  "in_discussion",
  "sold",
  "produced",
  "passed",
  "archived",
]);

export const FORMAT_TYPES = mk([
  "competition",
  "docuseries",
  "documentary",
  "talk_show",
  "game_show",
  "podcast",
  "digital_series",
  "reality_series",
  "branded_series",
  "event",
  "film",
  "other",
]);

// --- Opportunities -----------------------------------------------------------

export const OPPORTUNITY_TYPES = mk([
  "brand_brief",
  "casting_need",
  "development_target",
  "partnership",
  "event",
  "outreach",
  "platform_ask",
  "sponsor_opportunity",
  "internal_research_question",
  "other",
]);

export const OPPORTUNITY_STATUSES = mk([
  "researching",
  "active",
  "outbound",
  "in_discussion",
  "completed",
  "passed",
  "archived",
]);

// --- Social platforms --------------------------------------------------------

export const SOCIAL_PLATFORMS: LabeledValue[] = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "x", label: "X" },
  { value: "twitch", label: "Twitch" },
  { value: "facebook", label: "Facebook" },
  { value: "snapchat", label: "Snapchat" },
  { value: "threads", label: "Threads" },
  { value: "podcast", label: "Podcast" },
  { value: "other", label: "Other" },
];

export const socialLabel = (platform: string) =>
  SOCIAL_PLATFORMS.find((p) => p.value === platform)?.label ?? label(platform);

// --- Location relationship types --------------------------------------------

export const LOCATION_RELATIONSHIPS = mk([
  "based_in",
  "hometown",
  "born_in",
  "frequently_works_in",
  "other",
]);

// --- Confidence --------------------------------------------------------------

export const CONFIDENCE_LEVELS = mk([
  "confirmed",
  "reported",
  "internal",
  "unverified",
]);

// --- Source types ------------------------------------------------------------

export const SOURCE_TYPES = mk([
  "public",
  "representative",
  "internal_conversation",
  "research",
  "social_content",
  "official_page",
  "other",
]);

// --- Creator statuses --------------------------------------------------------

export const CREATOR_STATUSES = mk(["active", "watch", "priority", "archived"]);

// --- Target types (polymorphic references) -----------------------------------

export const TARGET_TYPES = [
  "creator",
  "project",
  "organization",
  "format",
  "opportunity",
  "person",
  "entity",
  "collection",
] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export const targetPath = (targetType: string, slug: string): string => {
  switch (targetType) {
    case "creator":
      return `/creators/${slug}`;
    case "project":
      return `/projects/${slug}`;
    case "organization":
      return `/organizations/${slug}`;
    case "format":
      return `/formats/${slug}`;
    case "opportunity":
      return `/opportunities/${slug}`;
    case "person":
      return `/people/${slug}`;
    case "collection":
      return `/collections/${slug}`;
    default:
      return "/";
  }
};

export const USER_ROLES = ["VIEWER", "EDITOR", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];
