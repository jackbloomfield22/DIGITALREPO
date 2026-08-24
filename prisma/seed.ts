// Demo seed for the 4.4.FORTY Digital Bible.
// Every person, company, and project here is fictional. Overlaps (shared
// sports, cities, production companies, brands) are intentional so relational
// discovery has something to discover.

import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { slugify } from "../src/lib/slug";
import { SPORTS_CALENDAR } from "../src/lib/sports-calendar-data";

const db = new PrismaClient();

async function main() {
  // On hosted deploys the seed runs on every build with SEED_IF_EMPTY=1:
  // it bootstraps a fresh database once, then never touches an in-use one.
  if (process.env.SEED_IF_EMPTY) {
    const existingUsers = await db.user.count();
    if (existingUsers > 0) {
      console.log("Database already initialized — skipping seed.");
      return;
    }
  }
  console.log("Seeding Digital Bible demo data...");

  // --- Users -----------------------------------------------------------------
  // On hosted deploys (SEED_IF_EMPTY) the demo accounts get random passwords —
  // the well-known dev passwords must never exist on a public URL. The admin
  // password is printed once in the build log so the deployer can sign in.
  const hosted = !!process.env.SEED_IF_EMPTY;
  const randomPw = () => crypto.randomBytes(12).toString("base64url");
  const users = [
    { email: "admin@440.media", name: "Jordan Avery", role: "ADMIN", pw: hosted ? randomPw() : "admin440" },
    { email: "editor@440.media", name: "Sam Whitaker", role: "EDITOR", pw: hosted ? randomPw() : "editor440" },
    { email: "viewer@440.media", name: "Riley Chen", role: "VIEWER", pw: hosted ? randomPw() : "viewer440" },
  ];
  if (hosted) {
    console.log("──────────────────────────────────────────────────────────");
    console.log(`  Bootstrap admin: ${users[0].email} / ${users[0].pw}`);
    console.log("  Save this password now — it is only printed once, here.");
    console.log("──────────────────────────────────────────────────────────");
  }
  const [admin, editor] = await Promise.all(
    users.map((u) =>
      db.user.upsert({
        where: { email: u.email },
        update: {},
        create: {
          email: u.email,
          name: u.name,
          role: u.role,
          passwordHash: bcrypt.hashSync(u.pw, 10),
        },
      }),
    ),
  );

  // --- Taxonomy entities -----------------------------------------------------
  const entityDefs: [string, string[]][] = [
    ["sport", ["Soccer", "Basketball", "Football", "Boxing", "Golf", "Track & Field", "Surfing", "Fishing", "Esports", "Tennis"]],
    ["interest", ["Fashion", "Entrepreneurship", "Cooking", "Travel", "Gaming", "Tech", "Survival", "Wildlife", "Fitness", "Wellness", "Music", "Beauty", "Cars", "Pop Culture", "True Crime", "Comedy", "BBQ", "Sustainability", "Grilling", "Aviation", "Food", "Magic", "Photography", "Ocean Conservation", "Sneakers", "Startups", "Country Music", "Investing"]],
    ["hobby", ["DIY", "Vintage Cars", "Chess", "Hiking", "Thrifting"]],
    ["location", ["Los Angeles", "New York", "Atlanta", "Austin", "Denver", "Miami", "Nashville", "Las Vegas", "Houston", "Portland", "Dallas", "San Diego", "Scottsdale", "Chicago"]],
    ["creator_category", ["Creator", "Athlete", "Retired Athlete", "Host", "Podcaster", "YouTuber", "Streamer", "Chef", "Comedian", "Influencer", "Entrepreneur", "Reality Personality", "Musician", "Media Personality", "Entertainer", "Journalist", "Actor"]],
    ["vertical", ["Sports", "Food", "Comedy", "Travel", "Business", "Outdoors", "Gaming", "Music", "Fashion", "Wellness", "Aviation", "Culture"]],
    ["genre", ["Competition", "Documentary", "Reality", "Talk", "Adventure", "Lifestyle"]],
    ["audience_type", ["Gen Z", "Millennial", "Sports Fans", "Foodies", "Families"]],
    ["tag", ["Bilingual", "Veteran Host", "Family Friendly", "Live Event Experience"]],
  ];

  const E: Record<string, { id: string }> = {};
  for (const [kind, names] of entityDefs) {
    for (const name of names) {
      const slug = slugify(name);
      E[`${kind}:${slug}`] = await db.entity.upsert({
        where: { kind_slug: { kind, slug } },
        update: {},
        create: { kind, slug, name },
      });
    }
  }
  const ent = (kind: string, name: string) => {
    const e = E[`${kind}:${slugify(name)}`];
    if (!e) throw new Error(`Unknown entity ${kind}:${name}`);
    return e.id;
  };

  // --- Organizations ---------------------------------------------------------
  type OrgDef = {
    name: string;
    types: string[];
    description?: string;
    website?: string;
    location?: string;
  };
  const orgDefs: OrgDef[] = [
    { name: "Ironbark Pictures", types: ["production_company"], description: "Unscripted production company known for athlete-led competition and documentary series.", location: "Los Angeles", website: "https://example.com/ironbark" },
    { name: "Halcyon North", types: ["production_company", "studio"], description: "Comedy-leaning production shop producing digital-first series and broadcast formats.", location: "New York" },
    { name: "Westgate Studios", types: ["studio", "production_company"], description: "Premium documentary studio.", location: "Los Angeles" },
    { name: "Driftline Films", types: ["production_company"], description: "Adventure and outdoors specialist producers.", location: "Denver" },
    { name: "Signal Grove Audio", types: ["podcast_company", "production_company"], description: "Podcast network and audio production company.", location: "Austin" },
    { name: "Meridian TV", types: ["network"], description: "Cable and broadcast network with a heavy unscripted slate." },
    { name: "Streamline", types: ["streamer"], description: "Subscription streamer investing in creator-led competition formats." },
    { name: "Cascade+", types: ["streamer"], description: "Documentary-forward streaming service." },
    { name: "GlitchTV", types: ["digital_platform"], description: "Live streaming platform for gaming and esports." },
    { name: "Podwave", types: ["digital_platform", "podcast_company"], description: "Podcast distribution platform." },
    { name: "Voltix Energy", types: ["brand"], description: "Energy drink brand active in creator and sports sponsorships." },
    { name: "Northpeak Apparel", types: ["brand"], description: "Performance apparel brand." },
    { name: "Solace Skincare", types: ["brand", "startup"], description: "Direct-to-consumer skincare brand founded by a creator." },
    { name: "TrailForge", types: ["brand"], description: "Outdoor gear brand." },
    { name: "Hearthstone Grills", types: ["brand"], description: "Premium grill manufacturer." },
    { name: "Bluewave Hydration", types: ["brand"], description: "Hydration and electrolyte brand." },
    { name: "Apex Talent Group", types: ["agency"], description: "Full-service talent agency with a large digital division.", location: "Los Angeles" },
    { name: "Harborlight Management", types: ["management_company"], description: "Boutique talent management firm.", location: "New York" },
    { name: "Crescent PR", types: ["agency"], description: "Publicity and communications agency." },
    { name: "Carter Media", types: ["creator_owned_company", "podcast_company"], description: "Media company founded by Deon Carter around basketball culture." },
    { name: "Delgado Ventures", types: ["creator_owned_company", "investment_firm"], description: "Holding company for Maya Delgado's businesses and investments." },
    { name: "Foundry Capital", types: ["investment_firm"], description: "Early-stage fund investing in creator economy startups.", location: "Austin" },
    { name: "Coastal Soccer League", types: ["sports_league"], description: "Regional professional soccer league." },
  ];
  const O: Record<string, { id: string }> = {};
  for (const o of orgDefs) {
    const slug = slugify(o.name);
    O[slug] = await db.organization.upsert({
      where: { slug },
      update: {},
      create: { slug, name: o.name, types: o.types, description: o.description, website: o.website, location: o.location },
    });
  }
  const org = (name: string) => O[slugify(name)].id;

  // --- Industry people -------------------------------------------------------
  type PersonDef = { name: string; title: string; roleType: string; org?: string };
  const personDefs: PersonDef[] = [
    { name: "Ava Sterling", title: "Agent, Digital Talent", roleType: "agent", org: "Apex Talent Group" },
    { name: "Miles Corbin", title: "Agent, Sports", roleType: "agent", org: "Apex Talent Group" },
    { name: "Renee Vaughn", title: "Talent Manager", roleType: "manager", org: "Harborlight Management" },
    { name: "Theo Park", title: "Talent Manager", roleType: "manager", org: "Harborlight Management" },
    { name: "Dana Whitfield", title: "Publicist", roleType: "publicist", org: "Crescent PR" },
    { name: "Jonah Fields", title: "VP, Unscripted Originals", roleType: "executive", org: "Streamline" },
    { name: "Isabel Moreno", title: "Showrunner", roleType: "showrunner" },
    { name: "Victor Hale", title: "SVP, Development", roleType: "executive", org: "Meridian TV" },
  ];
  const P: Record<string, { id: string }> = {};
  for (const p of personDefs) {
    const slug = slugify(p.name);
    P[slug] = await db.industryPerson.upsert({
      where: { slug },
      update: {},
      create: { slug, name: p.name, title: p.title, roleType: p.roleType },
    });
    if (p.org) {
      await db.personOrganization.upsert({
        where: { personId_organizationId: { personId: P[slug].id, organizationId: org(p.org) } },
        update: {},
        create: { personId: P[slug].id, organizationId: org(p.org), role: p.title },
      });
    }
  }
  const person = (name: string) => P[slugify(name)].id;

  // --- Creators --------------------------------------------------------------
  type SocialDef = { platform: string; handle: string; followers: number };
  type CreatorDef = {
    name: string;
    headline: string;
    categories: string[];
    basedIn: string;
    hometown?: string;
    age?: number;
    sports?: string[];
    interests?: string[];
    hobbies?: string[];
    tags?: string[];
    socials: SocialDef[];
    miniBio: string;
    digitalSummary?: string;
    opportunityNotes?: string;
    rep?: { person: string; relationship: string }[];
  };

  const creatorDefs: CreatorDef[] = [
    {
      name: "Maya Delgado",
      headline: "Pro soccer forward turned host and founder",
      categories: ["Athlete", "Host", "Entrepreneur"],
      basedIn: "Los Angeles", hometown: "Houston", age: 27,
      sports: ["Soccer"], interests: ["Fashion", "Entrepreneurship", "Investing"],
      tags: ["Bilingual", "Veteran Host"],
      socials: [
        { platform: "instagram", handle: "mayadelgado", followers: 4_800_000 },
        { platform: "tiktok", handle: "mayadelgado", followers: 9_200_000 },
        { platform: "youtube", handle: "MayaDelgado", followers: 1_400_000 },
      ],
      miniBio: "Coastal Soccer League forward who built a massive following through training content and lifestyle vlogs. Founded Delgado Ventures to hold her apparel and media investments. Confident on-camera host with live TV experience.",
      digitalSummary: "Strongest on TikTok where training breakdowns routinely clear 2M views. Instagram skews fashion and matchday. YouTube channel is growing on the strength of a weekly vlog.",
      opportunityNotes: "Top-tier host candidate for any sports-adjacent competition format. Brand-safe, bilingual, strong live reps.",
      rep: [{ person: "Ava Sterling", relationship: "agent" }],
    },
    {
      name: "Deon Carter",
      headline: "Retired basketball guard, podcast host, founder of Carter Media",
      categories: ["Retired Athlete", "Podcaster", "Entrepreneur"],
      basedIn: "Atlanta", age: 36,
      sports: ["Basketball"], interests: ["Sneakers", "Entrepreneurship", "Music"],
      socials: [
        { platform: "instagram", handle: "deoncarter", followers: 2_100_000 },
        { platform: "youtube", handle: "TheReboundShow", followers: 980_000 },
        { platform: "x", handle: "deoncarter", followers: 1_500_000 },
      ],
      miniBio: "Played nine professional seasons before launching The Rebound, a twice-weekly basketball culture podcast he hosts and executive produces through his own company, Carter Media.",
      digitalSummary: "Podcast clips drive most social reach. X presence is strong around live game commentary.",
      opportunityNotes: "Natural fit for docuseries and talk formats; already owns his own production pipeline.",
      rep: [{ person: "Miles Corbin", relationship: "agent" }],
    },
    {
      name: "Sasha Kim",
      headline: "Chef and food storyteller",
      categories: ["Chef", "YouTuber", "Host"],
      basedIn: "New York", age: 31,
      interests: ["Cooking", "Travel", "Food"],
      socials: [
        { platform: "youtube", handle: "SashaKimCooks", followers: 3_600_000 },
        { platform: "instagram", handle: "sashakimcooks", followers: 1_900_000 },
        { platform: "tiktok", handle: "sashakimcooks", followers: 2_700_000 },
      ],
      miniBio: "Former restaurant line cook whose travel-cooking series Fork in the Road became a breakout YouTube franchise. Judged and hosted broadcast cooking competition Fast Lane Cook-Off.",
      digitalSummary: "YouTube is the anchor; long-form travel episodes average 1.5M views. Short-form recipe cuts perform consistently on TikTok.",
      opportunityNotes: "Proven host with both digital and broadcast reps. Strong candidate for premium food-travel formats.",
      rep: [{ person: "Renee Vaughn", relationship: "manager" }],
    },
    {
      name: "Tommy Reyes",
      headline: "Stand-up comedian and digital sketch host",
      categories: ["Comedian", "Host"],
      basedIn: "Los Angeles", age: 29,
      interests: ["Comedy", "Gaming", "Cars"],
      socials: [
        { platform: "tiktok", handle: "tommyreyescomedy", followers: 5_400_000 },
        { platform: "instagram", handle: "tommyreyes", followers: 2_300_000 },
        { platform: "youtube", handle: "TommyReyes", followers: 1_100_000 },
      ],
      miniBio: "Stand-up comic who hosts Punchline Drive, an interview-in-a-car digital series produced with Halcyon North. Frequent collaborator with entertainer Oliver Banks.",
      opportunityNotes: "High-energy host; good chemistry-based casting piece for ensemble competition formats.",
      rep: [{ person: "Theo Park", relationship: "manager" }],
    },
    {
      name: "Priya Nair",
      headline: "Variety streamer and esports host",
      categories: ["Streamer", "Host"],
      basedIn: "Austin", age: 26,
      sports: ["Esports"], interests: ["Gaming", "Tech"],
      tags: ["Live Event Experience"],
      socials: [
        { platform: "twitch", handle: "priyaplays", followers: 1_800_000 },
        { platform: "youtube", handle: "PriyaPlays", followers: 950_000 },
        { platform: "tiktok", handle: "priyaplays", followers: 1_200_000 },
      ],
      miniBio: "Variety streamer averaging 12k concurrents. Hosted and executive produced Checkmate Live, a chess-meets-esports special on GlitchTV, and runs the nightly Night Shift Radio stream.",
      digitalSummary: "Twitch-native audience with strong community retention; clips travel well to TikTok.",
      rep: [{ person: "Theo Park", relationship: "manager" }],
    },
    {
      name: "Jake Holloway",
      headline: "Outdoorsman and fishing YouTuber",
      categories: ["YouTuber", "Host"],
      basedIn: "Denver", age: 33,
      sports: ["Fishing"], interests: ["Survival", "Wildlife", "BBQ"],
      hobbies: ["Hiking"],
      socials: [
        { platform: "youtube", handle: "FullSendFishing", followers: 4_100_000 },
        { platform: "instagram", handle: "jakeholloway", followers: 850_000 },
      ],
      miniBio: "Built Full Send Fishing into one of the biggest outdoor channels on YouTube. Partnered with TrailForge on a signature gear line. Hosts the Trail Mix series with rotating guests.",
      opportunityNotes: "Anchor talent for any outdoors vertical push. Audience trusts product recommendations.",
    },
    {
      name: "Lena Brooks",
      headline: "Fitness trainer and competition host",
      categories: ["Influencer", "Host", "Entrepreneur"],
      basedIn: "Miami", age: 30,
      interests: ["Fitness", "Wellness", "Fashion"],
      socials: [
        { platform: "instagram", handle: "lenabrooksfit", followers: 6_200_000 },
        { platform: "tiktok", handle: "lenabrooksfit", followers: 3_900_000 },
        { platform: "youtube", handle: "LenaBrooks", followers: 720_000 },
      ],
      miniBio: "Celebrity trainer who hosted Iron Grit Challenge on Streamline, produced by Ironbark Pictures. Northpeak Apparel ambassador since 2024.",
      opportunityNotes: "Proven competition host; strong brand track record in the wellness space.",
      rep: [{ person: "Ava Sterling", relationship: "agent" }],
    },
    {
      name: "Marcus Ohene",
      headline: "Soccer freestyler and street football personality",
      categories: ["Athlete", "Influencer"],
      basedIn: "New York", age: 24,
      sports: ["Soccer"], interests: ["Music", "Fashion"],
      tags: ["Bilingual"],
      socials: [
        { platform: "tiktok", handle: "marcusohene", followers: 11_500_000 },
        { platform: "instagram", handle: "marcusohene", followers: 3_800_000 },
        { platform: "youtube", handle: "MarcusOhene", followers: 2_200_000 },
      ],
      miniBio: "World-class freestyler who came up through New York street football courts. Cast standout on the competition series Street Pitch. Voltix Energy campaign talent.",
      digitalSummary: "One of the largest soccer-adjacent TikTok accounts in the database; trick content is endlessly clippable.",
      opportunityNotes: "Younger-skewing soccer audience; strong World Cup cycle candidate.",
    },
    {
      name: "Callie Jensen",
      headline: "Reality personality and skincare founder",
      categories: ["Reality Personality", "Entrepreneur"],
      basedIn: "Nashville", age: 28,
      interests: ["Beauty", "Country Music", "Entrepreneurship"],
      socials: [
        { platform: "instagram", handle: "calliejensen", followers: 4_400_000 },
        { platform: "tiktok", handle: "calliejensen", followers: 2_800_000 },
      ],
      miniBio: "Breakout cast member from the fashion reality series The Cut who parlayed her platform into Solace Skincare, which she founded and runs. Frequent podcast guest.",
      rep: [{ person: "Dana Whitfield", relationship: "publicist" }],
    },
    {
      name: "Rico Alvarez",
      headline: "Undefeated super-lightweight boxer",
      categories: ["Athlete"],
      basedIn: "Las Vegas", age: 25,
      sports: ["Boxing"], interests: ["Cars", "Fashion"],
      hobbies: ["Vintage Cars"],
      socials: [
        { platform: "instagram", handle: "ricoalvarez", followers: 3_100_000 },
        { platform: "tiktok", handle: "ricoalvarez", followers: 1_700_000 },
      ],
      miniBio: "Rising boxing star and subject of the Ironbark Pictures docuseries Grit City on Meridian TV. Training content and car collection drive his social presence.",
      opportunityNotes: "Docuseries-proven; limited hosting reps so far but big personality.",
      rep: [{ person: "Miles Corbin", relationship: "agent" }],
    },
    {
      name: "Emmy Chen",
      headline: "Culture journalist and podcast host",
      categories: ["Podcaster", "Journalist", "Media Personality"],
      basedIn: "Los Angeles", age: 32,
      interests: ["Pop Culture", "True Crime"],
      socials: [
        { platform: "podcast", handle: "Golden Hour", followers: 600_000 },
        { platform: "instagram", handle: "emmychen", followers: 890_000 },
        { platform: "x", handle: "emmychen", followers: 1_100_000 },
      ],
      miniBio: "Hosts Golden Hour, a twice-weekly pop culture podcast with Signal Grove Audio. Former entertainment desk journalist with sharp interview chops.",
      rep: [{ person: "Dana Whitfield", relationship: "publicist" }],
    },
    {
      name: "Grant Foster",
      headline: "Golf trick-shot artist and branded series host",
      categories: ["Athlete", "YouTuber", "Host"],
      basedIn: "Scottsdale", age: 29,
      sports: ["Golf"], interests: ["Comedy"],
      socials: [
        { platform: "youtube", handle: "GrantFosterGolf", followers: 2_900_000 },
        { platform: "tiktok", handle: "grantfostergolf", followers: 4_600_000 },
        { platform: "instagram", handle: "grantfostergolf", followers: 1_300_000 },
      ],
      miniBio: "Turned viral golf trick shots into a media brand. Hosts Backyard Legends, a Voltix Energy branded competition series. Comfortable carrying sponsor-led formats.",
      rep: [{ person: "Ava Sterling", relationship: "agent" }],
    },
    {
      name: "Zoe Okafor",
      headline: "Sprinter and fashion-forward athlete",
      categories: ["Athlete", "Influencer"],
      basedIn: "Houston", age: 23,
      sports: ["Track & Field"], interests: ["Fashion", "Entrepreneurship", "Fitness"],
      socials: [
        { platform: "instagram", handle: "zoeokafor", followers: 2_600_000 },
        { platform: "tiktok", handle: "zoeokafor", followers: 3_300_000 },
      ],
      miniBio: "National-champion sprinter known for track-to-runway content. Northpeak Apparel campaign athlete; guest on the Board Meeting business podcast.",
      opportunityNotes: "Strong crossover between sports and fashion audiences; unproven as host but high potential.",
    },
    {
      name: "Beau Tran",
      headline: "Pitmaster and cooking competition winner",
      categories: ["Chef"],
      basedIn: "Austin", age: 35,
      interests: ["BBQ", "Cooking", "Travel"],
      socials: [
        { platform: "youtube", handle: "BeauTranBBQ", followers: 1_600_000 },
        { platform: "instagram", handle: "beautranbbq", followers: 740_000 },
        { platform: "tiktok", handle: "beautranbbq", followers: 1_900_000 },
      ],
      miniBio: "Austin pitmaster who won season two of Fast Lane Cook-Off on Meridian TV. Co-hosts the outdoor cooking series Wild Table with Jake Holloway.",
      rep: [{ person: "Renee Vaughn", relationship: "manager" }],
    },
    {
      name: "Harper Quinn",
      headline: "DIY and sustainable living creator",
      categories: ["YouTuber", "Influencer"],
      basedIn: "Portland", age: 27,
      interests: ["Sustainability"],
      hobbies: ["DIY", "Thrifting"],
      socials: [
        { platform: "youtube", handle: "HarperQuinnDIY", followers: 2_200_000 },
        { platform: "instagram", handle: "harperquinn", followers: 980_000 },
        { platform: "tiktok", handle: "harperquinn", followers: 1_500_000 },
      ],
      miniBio: "Renovation and upcycling creator whose budget build series inspired a wave of copycats. Guested on Trail Mix; part of the Side Hustle Showdown development cast.",
    },
    {
      name: "Dre Watkins",
      headline: "Former linebacker turned grilling host",
      categories: ["Retired Athlete", "Host"],
      basedIn: "Dallas", age: 38,
      sports: ["Football"], interests: ["Grilling", "BBQ", "Comedy"],
      tags: ["Veteran Host"],
      socials: [
        { platform: "instagram", handle: "drewatkins", followers: 1_900_000 },
        { platform: "youtube", handle: "DreWatkinsGrills", followers: 1_250_000 },
        { platform: "tiktok", handle: "drewatkins", followers: 2_100_000 },
      ],
      miniBio: "Ten-year pro linebacker who reinvented himself as television's favorite tailgate cook. Hosts Home Turf on Meridian TV and competed on Iron Grit Challenge. Hearthstone Grills partner.",
      opportunityNotes: "One of the most broadcast-proven hosts in the database.",
      rep: [{ person: "Miles Corbin", relationship: "agent" }],
    },
    {
      name: "Nina Rossi",
      headline: "Travel vlogger and licensed pilot",
      categories: ["YouTuber", "Host"],
      basedIn: "Miami", age: 31,
      interests: ["Travel", "Aviation", "Food", "Photography"],
      socials: [
        { platform: "youtube", handle: "NinaRossiFlies", followers: 2_800_000 },
        { platform: "instagram", handle: "ninarossi", followers: 1_600_000 },
        { platform: "tiktok", handle: "ninarossi", followers: 2_000_000 },
      ],
      miniBio: "Licensed pilot who flies herself to filming locations for Sky High, her aviation-travel series. Collaborated with Sasha Kim on a Fork in the Road crossover episode.",
      opportunityNotes: "Aviation angle is rare and ownable; strong fit for premium travel formats.",
      rep: [{ person: "Renee Vaughn", relationship: "manager" }],
    },
    {
      name: "Oliver Banks",
      headline: "Magician and comedic entertainer",
      categories: ["Entertainer", "Comedian"],
      basedIn: "Los Angeles", age: 34,
      interests: ["Magic", "Comedy"],
      hobbies: ["Chess"],
      socials: [
        { platform: "tiktok", handle: "oliverbanksmagic", followers: 7_800_000 },
        { platform: "instagram", handle: "oliverbanksmagic", followers: 2_500_000 },
        { platform: "youtube", handle: "OliverBanks", followers: 1_800_000 },
      ],
      miniBio: "Close-up magician whose street performances made him a short-form phenomenon. Recurring guest on Punchline Drive with Tommy Reyes.",
    },
    {
      name: "Skye Morales",
      headline: "Pro surfer and ocean conservation advocate",
      categories: ["Athlete"],
      basedIn: "San Diego", age: 26,
      sports: ["Surfing"], interests: ["Ocean Conservation", "Photography", "Sustainability"],
      socials: [
        { platform: "instagram", handle: "skyemorales", followers: 2_400_000 },
        { platform: "youtube", handle: "SkyeMorales", followers: 640_000 },
        { platform: "tiktok", handle: "skyemorales", followers: 1_800_000 },
      ],
      miniBio: "Championship surfer, subject of the Cascade+ documentary Chase the Sun, and host of the docuseries Open Water. Bluewave Hydration ambassador.",
      opportunityNotes: "Purpose-driven brand fits; documentary-proven with hosting reps.",
    },
    {
      name: "Colt Bergman",
      headline: "Serial founder, investor, and business podcast host",
      categories: ["Entrepreneur", "Podcaster"],
      basedIn: "Austin", age: 39,
      sports: ["Golf"], interests: ["Startups", "Investing", "Fitness", "Entrepreneurship"],
      socials: [
        { platform: "podcast", handle: "Board Meeting", followers: 450_000 },
        { platform: "x", handle: "coltbergman", followers: 2_200_000 },
        { platform: "youtube", handle: "BoardMeetingPod", followers: 800_000 },
        { platform: "instagram", handle: "coltbergman", followers: 500_000 },
      ],
      miniBio: "Founded and exited two consumer startups before launching Foundry Capital. Hosts and executive produces Board Meeting, a business podcast with a heavy athlete-founder guest list.",
      opportunityNotes: "Anchor for any entrepreneurship format; deep founder network.",
    },
  ];

  const C: Record<string, { id: string; name: string }> = {};
  for (const c of creatorDefs) {
    const slug = slugify(c.name);
    const existing = await db.creator.findUnique({ where: { slug } });
    const creator =
      existing ??
      (await db.creator.create({
        data: {
          slug,
          name: c.name,
          headline: c.headline,
          age: c.age,
          miniBio: c.miniBio,
          digitalSummary: c.digitalSummary,
          opportunityNotes: c.opportunityNotes,
          lastVerifiedAt: new Date(),
        },
      }));
    C[slug] = creator;
    if (existing) continue;

    for (const s of c.socials) {
      await db.socialProfile.create({
        data: {
          creatorId: creator.id,
          platform: s.platform,
          handle: s.handle,
          url:
            s.platform === "podcast"
              ? undefined
              : `https://example.com/${s.platform}/${s.handle}`,
          followerCount: s.followers,
          countUpdatedAt: new Date(),
        },
      });
    }

    const links: { entityId: string; relationship?: string }[] = [];
    for (const cat of c.categories) links.push({ entityId: ent("creator_category", cat) });
    links.push({ entityId: ent("location", c.basedIn), relationship: "based_in" });
    if (c.hometown) links.push({ entityId: ent("location", c.hometown), relationship: "hometown" });
    for (const s of c.sports ?? []) links.push({ entityId: ent("sport", s) });
    for (const i of c.interests ?? []) links.push({ entityId: ent("interest", i) });
    for (const h of c.hobbies ?? []) links.push({ entityId: ent("hobby", h) });
    for (const t of c.tags ?? []) links.push({ entityId: ent("tag", t) });
    for (const l of links) {
      await db.creatorEntityLink.upsert({
        where: {
          creatorId_entityId_relationship: {
            creatorId: creator.id,
            entityId: l.entityId,
            relationship: l.relationship ?? "",
          },
        },
        update: {},
        create: {
          creatorId: creator.id,
          entityId: l.entityId,
          relationship: l.relationship ?? "",
        },
      });
    }
    for (const r of c.rep ?? []) {
      await db.creatorPerson.create({
        data: { creatorId: creator.id, personId: person(r.person), relationship: r.relationship },
      });
    }
  }
  const cr = (name: string) => C[slugify(name)].id;

  // --- Projects --------------------------------------------------------------
  type ProjectDef = {
    title: string;
    projectType: string;
    status: string;
    logline: string;
    premiereYear?: number;
    seasons?: number;
    episodes?: number;
    orgs?: [string, string][]; // [org name, relationship]
    credits?: [string, string[]][]; // [creator name, roles]
    people?: [string, string][]; // [person name, role]
    topics?: string[]; // vertical entities
    genres?: string[];
  };
  const projectDefs: ProjectDef[] = [
    {
      title: "Street Pitch", projectType: "competition_show", status: "released",
      logline: "Street footballers battle through five-a-side gauntlets in America's most iconic courts.",
      premiereYear: 2024, seasons: 2, episodes: 16,
      orgs: [["Ironbark Pictures", "production_company"], ["Streamline", "streamer"], ["Voltix Energy", "sponsor"], ["Coastal Soccer League", "brand_partner"]],
      credits: [["Maya Delgado", ["host"]], ["Marcus Ohene", ["cast"]]],
      people: [["Isabel Moreno", "showrunner"]],
      topics: ["Sports"], genres: ["Competition"],
    },
    {
      title: "The Rebound", projectType: "podcast", status: "airing",
      logline: "Basketball culture, twice a week, from a guy who lived it.",
      premiereYear: 2021, episodes: 320,
      orgs: [["Carter Media", "production_company"], ["Podwave", "platform"]],
      credits: [["Deon Carter", ["host", "executive_producer", "creator"]], ["Colt Bergman", ["guest"]]],
      topics: ["Sports", "Culture"], genres: ["Talk"],
    },
    {
      title: "Fork in the Road", projectType: "youtube_series", status: "airing",
      logline: "A chef cooks her way through the world's food capitals one detour at a time.",
      premiereYear: 2022, seasons: 4, episodes: 48,
      credits: [["Sasha Kim", ["host", "creator"]], ["Nina Rossi", ["guest"]]],
      topics: ["Food", "Travel"], genres: ["Adventure"],
    },
    {
      title: "Punchline Drive", projectType: "digital_series", status: "airing",
      logline: "Comedians trade sets for shotgun seats in a rolling interview show.",
      premiereYear: 2023, seasons: 3, episodes: 36,
      orgs: [["Halcyon North", "production_company"]],
      credits: [["Tommy Reyes", ["host", "creator"]], ["Oliver Banks", ["recurring_guest"]]],
      topics: ["Comedy"], genres: ["Talk"],
    },
    {
      title: "Full Send Fishing", projectType: "youtube_series", status: "airing",
      logline: "Big water, bigger fish, no second takes.",
      premiereYear: 2019, episodes: 210,
      credits: [["Jake Holloway", ["host", "creator", "owner"]]],
      orgs: [["TrailForge", "sponsor"]],
      topics: ["Outdoors"], genres: ["Adventure"],
    },
    {
      title: "Grit City", projectType: "docuseries", status: "released",
      logline: "A year inside the camp of boxing's most relentless rising star.",
      premiereYear: 2025, seasons: 1, episodes: 6,
      orgs: [["Ironbark Pictures", "production_company"], ["Meridian TV", "network"]],
      credits: [["Rico Alvarez", ["subject"]]],
      topics: ["Sports"], genres: ["Documentary"],
    },
    {
      title: "Chase the Sun", projectType: "documentary", status: "released",
      logline: "One surfer's season chasing the world's most dangerous breaks.",
      premiereYear: 2024,
      orgs: [["Westgate Studios", "production_company"], ["Cascade+", "streamer"]],
      credits: [["Skye Morales", ["subject"]]],
      topics: ["Sports", "Outdoors"], genres: ["Documentary"],
    },
    {
      title: "Board Meeting", projectType: "podcast", status: "airing",
      logline: "Founders and athletes on the businesses behind the brand.",
      premiereYear: 2020, episodes: 260,
      orgs: [["Signal Grove Audio", "production_company"], ["Podwave", "platform"]],
      credits: [["Colt Bergman", ["host", "executive_producer", "creator"]], ["Zoe Okafor", ["guest"]], ["Deon Carter", ["guest"]]],
      topics: ["Business"], genres: ["Talk"],
    },
    {
      title: "Fast Lane Cook-Off", projectType: "competition_show", status: "released",
      logline: "Chefs race the clock in a mobile kitchen where the road picks the menu.",
      premiereYear: 2023, seasons: 2, episodes: 20,
      orgs: [["Halcyon North", "production_company"], ["Meridian TV", "network"]],
      credits: [["Sasha Kim", ["host"]], ["Beau Tran", ["contestant"]]],
      people: [["Victor Hale", "executive_producer"]],
      topics: ["Food"], genres: ["Competition"],
    },
    {
      title: "Iron Grit Challenge", projectType: "competition_show", status: "released",
      logline: "Everyday athletes take on pro-designed gauntlets for a life-changing prize.",
      premiereYear: 2024, seasons: 1, episodes: 10,
      orgs: [["Ironbark Pictures", "production_company"], ["Streamline", "streamer"], ["Northpeak Apparel", "sponsor"]],
      credits: [["Lena Brooks", ["host"]], ["Dre Watkins", ["contestant"]]],
      people: [["Jonah Fields", "executive_producer"], ["Isabel Moreno", "showrunner"]],
      topics: ["Sports", "Wellness"], genres: ["Competition"],
    },
    {
      title: "Backyard Legends", projectType: "branded_series", status: "airing",
      logline: "Impossible trick shots, backyard rules, Voltix-fueled bragging rights.",
      premiereYear: 2024, seasons: 2, episodes: 14,
      orgs: [["Voltix Energy", "brand_partner"], ["Driftline Films", "production_company"]],
      credits: [["Grant Foster", ["host", "creator"]], ["Tommy Reyes", ["guest"]]],
      topics: ["Sports", "Comedy"], genres: ["Competition"],
    },
    {
      title: "The Cut", projectType: "reality_series", status: "ended",
      logline: "Twelve designers, one label deal, no safety net.",
      premiereYear: 2022, seasons: 3, episodes: 30,
      orgs: [["Westgate Studios", "production_company"], ["Meridian TV", "network"]],
      credits: [["Callie Jensen", ["cast"]]],
      topics: ["Fashion"], genres: ["Reality", "Competition"],
    },
    {
      title: "Open Water", projectType: "docuseries", status: "airing",
      logline: "The fight for the coastlines, told by the people who live on them.",
      premiereYear: 2025, seasons: 1, episodes: 8,
      orgs: [["Westgate Studios", "production_company"], ["Cascade+", "streamer"], ["Bluewave Hydration", "sponsor"]],
      credits: [["Skye Morales", ["host", "executive_producer"]]],
      topics: ["Outdoors", "Culture"], genres: ["Documentary"],
    },
    {
      title: "Night Shift Radio", projectType: "livestream", status: "airing",
      logline: "Late-night live talk and games for the chronically online.",
      premiereYear: 2023,
      orgs: [["GlitchTV", "platform"]],
      credits: [["Priya Nair", ["host", "creator"]]],
      topics: ["Gaming"], genres: ["Talk"],
    },
    {
      title: "Trail Mix", projectType: "youtube_series", status: "airing",
      logline: "Jake Holloway drags a new guest somewhere beautiful and mildly dangerous.",
      premiereYear: 2023, seasons: 2, episodes: 24,
      orgs: [["TrailForge", "brand_partner"], ["Driftline Films", "production_company"]],
      credits: [["Jake Holloway", ["host"]], ["Harper Quinn", ["guest"]], ["Beau Tran", ["guest"]]],
      topics: ["Outdoors", "Travel"], genres: ["Adventure"],
    },
    {
      title: "Second Wind", projectType: "docuseries", status: "released",
      logline: "Retired pros confront the question no one prepares them for: what now?",
      premiereYear: 2025, seasons: 1, episodes: 6,
      orgs: [["Ironbark Pictures", "production_company"], ["Cascade+", "streamer"]],
      credits: [["Deon Carter", ["subject", "executive_producer"]], ["Dre Watkins", ["subject"]]],
      people: [["Isabel Moreno", "showrunner"]],
      topics: ["Sports", "Culture"], genres: ["Documentary"],
    },
    {
      title: "Golden Hour", projectType: "podcast", status: "airing",
      logline: "The week in pop culture, prosecuted with receipts.",
      premiereYear: 2022, episodes: 210,
      orgs: [["Signal Grove Audio", "production_company"], ["Podwave", "platform"]],
      credits: [["Emmy Chen", ["host", "creator"]], ["Callie Jensen", ["guest"]]],
      topics: ["Culture"], genres: ["Talk"],
    },
    {
      title: "Home Turf", projectType: "tv_series", status: "airing",
      logline: "A retired linebacker crashes the best tailgates in America.",
      premiereYear: 2023, seasons: 2, episodes: 18,
      orgs: [["Halcyon North", "production_company"], ["Meridian TV", "network"], ["Hearthstone Grills", "sponsor"]],
      credits: [["Dre Watkins", ["host"]]],
      people: [["Victor Hale", "executive_producer"]],
      topics: ["Food", "Sports"], genres: ["Lifestyle"],
    },
    {
      title: "Sky High", projectType: "youtube_series", status: "airing",
      logline: "A pilot-vlogger flies herself to the world's hardest-to-reach places.",
      premiereYear: 2021, seasons: 3, episodes: 40,
      credits: [["Nina Rossi", ["host", "creator"]]],
      topics: ["Travel", "Aviation"], genres: ["Adventure"],
    },
    {
      title: "Checkmate Live", projectType: "special", status: "released",
      logline: "Streamers and grandmasters collide in a live chess-boxing spectacular.",
      premiereYear: 2025,
      orgs: [["GlitchTV", "platform"], ["Voltix Energy", "sponsor"]],
      credits: [["Priya Nair", ["host", "executive_producer"]], ["Oliver Banks", ["guest"]]],
      topics: ["Gaming"], genres: ["Competition"],
    },
  ];

  const PR: Record<string, { id: string }> = {};
  for (const p of projectDefs) {
    const slug = slugify(p.title);
    const existing = await db.project.findUnique({ where: { slug } });
    const project =
      existing ??
      (await db.project.create({
        data: {
          slug,
          title: p.title,
          projectType: p.projectType,
          status: p.status,
          logline: p.logline,
          premiereYear: p.premiereYear,
          seasons: p.seasons,
          episodes: p.episodes,
        },
      }));
    PR[slug] = project;
    if (existing) continue;

    for (const [orgName, rel] of p.orgs ?? []) {
      await db.projectOrganization.create({
        data: { projectId: project.id, organizationId: org(orgName), relationship: rel },
      });
    }
    for (const [creatorName, roles] of p.credits ?? []) {
      for (const role of roles) {
        await db.creatorProjectCredit.create({
          data: { creatorId: cr(creatorName), projectId: project.id, role },
        });
      }
    }
    for (const [personName, role] of p.people ?? []) {
      await db.personProject.create({
        data: { personId: person(personName), projectId: project.id, role },
      });
    }
    for (const t of p.topics ?? []) {
      await db.projectEntityLink.create({
        data: { projectId: project.id, entityId: ent("vertical", t) },
      });
    }
    for (const g of p.genres ?? []) {
      await db.projectEntityLink.create({
        data: { projectId: project.id, entityId: ent("genre", g) },
      });
    }
  }

  // --- Creator ↔ Organization relationships ---------------------------------
  const creatorOrgDefs: [string, string, string, string?][] = [
    ["Maya Delgado", "Voltix Energy", "ambassador", "active"],
    ["Marcus Ohene", "Voltix Energy", "campaign", "active"],
    ["Grant Foster", "Voltix Energy", "sponsored_content", "active"],
    ["Lena Brooks", "Northpeak Apparel", "ambassador", "active"],
    ["Zoe Okafor", "Northpeak Apparel", "campaign", "active"],
    ["Dre Watkins", "Hearthstone Grills", "partner", "active"],
    ["Jake Holloway", "TrailForge", "ambassador", "active"],
    ["Skye Morales", "Bluewave Hydration", "ambassador", "active"],
    ["Callie Jensen", "Solace Skincare", "founder", "active"],
    ["Deon Carter", "Carter Media", "founder", "active"],
    ["Maya Delgado", "Delgado Ventures", "founder", "active"],
    ["Colt Bergman", "Foundry Capital", "founder", "active"],
    ["Maya Delgado", "Coastal Soccer League", "athlete", "active"],
    ["Colt Bergman", "Solace Skincare", "investor", "active"],
  ];
  for (const [creatorName, orgName, rel, status] of creatorOrgDefs) {
    await db.creatorOrganization.upsert({
      where: {
        creatorId_organizationId_relationship: {
          creatorId: cr(creatorName), organizationId: org(orgName), relationship: rel,
        },
      },
      update: {},
      create: {
        creatorId: cr(creatorName), organizationId: org(orgName), relationship: rel, status: status ?? "active",
      },
    });
  }

  // --- Creator ↔ Creator relationships ---------------------------------------
  const relDefs: [string, string, string, string?][] = [
    ["Maya Delgado", "Marcus Ohene", "collaborated_with", "Street Pitch and freestyle content collabs"],
    ["Deon Carter", "Colt Bergman", "podcasted_with", "Cross-guested on each other's shows"],
    ["Sasha Kim", "Nina Rossi", "collaborated_with", "Fork in the Road crossover episode"],
    ["Tommy Reyes", "Oliver Banks", "recurring_content_partner", "Punchline Drive recurring pairing"],
    ["Lena Brooks", "Zoe Okafor", "collaborated_with", "Northpeak campaign shoot"],
    ["Jake Holloway", "Beau Tran", "co_host", "Wild Table development co-hosts"],
    ["Emmy Chen", "Callie Jensen", "podcasted_with", "Golden Hour interviews"],
  ];
  for (const [a, b, rel, note] of relDefs) {
    const [aId, bId] = [cr(a), cr(b)].sort();
    await db.creatorRelationship.upsert({
      where: {
        creatorAId_creatorBId_relationship: { creatorAId: aId, creatorBId: bId, relationship: rel },
      },
      update: {},
      create: { creatorAId: aId, creatorBId: bId, relationship: rel, note },
    });
  }

  // --- Formats ---------------------------------------------------------------
  type FormatDef = {
    title: string;
    logline: string;
    formatType: string;
    status: string;
    targetPlatform?: string;
    creators?: [string, boolean?][]; // [name, isPrimary]
    entities?: [string, string][]; // [kind, name]
    orgs?: [string, string][];
  };
  const formatDefs: FormatDef[] = [
    {
      title: "Athlete Boardroom", logline: "Athletes pitch their post-career businesses to a panel of founder-investors.",
      formatType: "competition", status: "pitched", targetPlatform: "Streamline",
      creators: [["Colt Bergman", true], ["Maya Delgado"], ["Deon Carter"], ["Zoe Okafor"]],
      entities: [["interest", "Entrepreneurship"], ["interest", "Startups"], ["vertical", "Business"], ["vertical", "Sports"]],
      orgs: [["Streamline", "target"], ["Foundry Capital", "partner"]],
    },
    {
      title: "Cook for Coach", logline: "Pitmasters cook for legendary coaches whose approval cannot be bought.",
      formatType: "competition", status: "developing",
      creators: [["Beau Tran", true], ["Dre Watkins"]],
      entities: [["interest", "BBQ"], ["interest", "Cooking"], ["vertical", "Food"], ["vertical", "Sports"]],
      orgs: [["Hearthstone Grills", "sponsor_target"]],
    },
    {
      title: "Trick Shot Kingdom", logline: "Golf's funniest trick-shot artists build the most absurd course ever played.",
      formatType: "competition", status: "idea",
      creators: [["Grant Foster", true]],
      entities: [["sport", "Golf"], ["vertical", "Sports"], ["vertical", "Comedy"]],
    },
    {
      title: "Ocean Guardians", logline: "Athletes and scientists team up to restore dying coastlines.",
      formatType: "docuseries", status: "concept",
      creators: [["Skye Morales", true]],
      entities: [["interest", "Ocean Conservation"], ["interest", "Sustainability"], ["vertical", "Outdoors"]],
      orgs: [["Bluewave Hydration", "sponsor_target"], ["Cascade+", "target"]],
    },
    {
      title: "First Class Chaos", logline: "Two creators, one destination, wildly unequal travel budgets.",
      formatType: "digital_series", status: "developing",
      creators: [["Nina Rossi", true], ["Tommy Reyes"]],
      entities: [["interest", "Travel"], ["vertical", "Travel"], ["vertical", "Comedy"]],
    },
    {
      title: "Small Town Ownership", logline: "Creators buy into small-town sports teams and try to turn them around.",
      formatType: "docuseries", status: "outbound",
      creators: [["Maya Delgado", true], ["Colt Bergman"]],
      entities: [["sport", "Soccer"], ["interest", "Entrepreneurship"], ["vertical", "Sports"], ["vertical", "Business"]],
      orgs: [["Coastal Soccer League", "partner"]],
    },
    {
      title: "The Freestyle League", logline: "City-versus-city freestyle soccer battles built for short-form.",
      formatType: "competition", status: "concept",
      creators: [["Marcus Ohene", true], ["Maya Delgado"]],
      entities: [["sport", "Soccer"], ["interest", "Music"], ["vertical", "Sports"]],
      orgs: [["Voltix Energy", "sponsor_target"]],
    },
    {
      title: "Grill Sergeant", logline: "A drill-sergeant grilling bootcamp for hopeless backyard cooks.",
      formatType: "reality_series", status: "pitched",
      creators: [["Dre Watkins", true]],
      entities: [["interest", "Grilling"], ["interest", "Comedy"], ["vertical", "Food"]],
      orgs: [["Meridian TV", "target"], ["Hearthstone Grills", "sponsor_target"]],
    },
    {
      title: "Side Hustle Showdown", logline: "Creators race to build the most profitable side business in 30 days.",
      formatType: "competition", status: "developing",
      creators: [["Colt Bergman", true], ["Callie Jensen"], ["Harper Quinn"]],
      entities: [["interest", "Entrepreneurship"], ["interest", "Startups"], ["vertical", "Business"]],
    },
    {
      title: "Stream Wars", logline: "Top streamers captain squads of rising talent in live elimination gauntlets.",
      formatType: "competition", status: "idea",
      creators: [["Priya Nair", true]],
      entities: [["sport", "Esports"], ["interest", "Gaming"], ["vertical", "Gaming"]],
      orgs: [["GlitchTV", "target"]],
    },
    {
      title: "Vault of Illusions", logline: "Magicians compete inside a puzzle-box mansion where the house fights back.",
      formatType: "competition", status: "concept",
      creators: [["Oliver Banks", true]],
      entities: [["interest", "Magic"], ["vertical", "Comedy"]],
    },
    {
      title: "Comeback Season", logline: "Retired athletes get one shot at an entirely new sport.",
      formatType: "docuseries", status: "in_discussion",
      creators: [["Deon Carter", true], ["Rico Alvarez"], ["Dre Watkins"]],
      entities: [["vertical", "Sports"], ["genre", "Documentary"]],
      orgs: [["Ironbark Pictures", "partner"], ["Cascade+", "target"]],
    },
    {
      title: "Fit Camp Rivals", logline: "America's toughest trainers battle through the athletes they build.",
      formatType: "competition", status: "pitched",
      creators: [["Lena Brooks", true], ["Zoe Okafor"]],
      entities: [["interest", "Fitness"], ["interest", "Wellness"], ["vertical", "Wellness"], ["vertical", "Sports"]],
      orgs: [["Northpeak Apparel", "sponsor_target"], ["Streamline", "target"]],
    },
    {
      title: "Wild Table", logline: "Catch it, clean it, cook it: a wilderness cooking show with zero grocery stores.",
      formatType: "digital_series", status: "developing",
      creators: [["Jake Holloway", true], ["Beau Tran"]],
      entities: [["interest", "Cooking"], ["interest", "Survival"], ["sport", "Fishing"], ["vertical", "Outdoors"], ["vertical", "Food"]],
      orgs: [["TrailForge", "sponsor_target"]],
    },
    {
      title: "Terminal Velocity", logline: "A pilot and an adrenaline athlete race weather windows around the globe.",
      formatType: "docuseries", status: "idea",
      creators: [["Nina Rossi", true], ["Skye Morales"]],
      entities: [["interest", "Aviation"], ["interest", "Travel"], ["vertical", "Aviation"], ["vertical", "Travel"]],
    },
  ];

  const F: Record<string, { id: string }> = {};
  for (const f of formatDefs) {
    const slug = slugify(f.title);
    const existing = await db.format.findUnique({ where: { slug } });
    const format =
      existing ??
      (await db.format.create({
        data: {
          slug, title: f.title, logline: f.logline, formatType: f.formatType,
          status: f.status, targetPlatform: f.targetPlatform, ownerId: editor.id,
        },
      }));
    F[slug] = format;
    if (existing) continue;
    for (const [name, isPrimary] of f.creators ?? []) {
      await db.creatorFormat.create({
        data: { creatorId: cr(name), formatId: format.id, isPrimary: !!isPrimary },
      });
    }
    for (const [kind, name] of f.entities ?? []) {
      await db.formatEntityLink.create({
        data: { formatId: format.id, entityId: ent(kind, name) },
      });
    }
    for (const [orgName, rel] of f.orgs ?? []) {
      await db.formatOrganization.create({
        data: { formatId: format.id, organizationId: org(orgName), relationship: rel },
      });
    }
  }

  // --- Opportunities ---------------------------------------------------------
  type OppDef = {
    title: string; type: string; status: string; description: string;
    entities?: [string, string][];
    creators?: [string, string][]; // [name, status]
    formats?: string[];
    orgs?: string[];
    audienceRequirements?: string;
  };
  const oppDefs: OppDef[] = [
    {
      title: "Voltix World Cup Creator Targets", type: "brand_brief", status: "researching",
      description: "Voltix wants 3–5 soccer-native creators for a World Cup content push. Priorities: authentic soccer credibility, fashion/culture crossover, younger audience, US market metros.",
      entities: [["sport", "Soccer"], ["interest", "Fashion"], ["location", "Los Angeles"], ["location", "New York"]],
      creators: [["Maya Delgado", "shortlist"], ["Marcus Ohene", "shortlist"]],
      formats: ["The Freestyle League"],
      orgs: ["Voltix Energy"],
      audienceRequirements: "1M+ combined social; Gen Z skew",
    },
    {
      title: "Streamline Competition Host Search", type: "casting_need", status: "active",
      description: "Streamline is staffing hosts for two new competition orders. Needs on-camera talent with proven live or competition hosting experience; athlete background a plus.",
      entities: [["creator_category", "Host"], ["creator_category", "Athlete"]],
      creators: [["Lena Brooks", "candidate"], ["Dre Watkins", "candidate"], ["Sasha Kim", "candidate"], ["Maya Delgado", "candidate"]],
      orgs: ["Streamline"],
    },
    {
      title: "Outdoor Vertical Development Sprint", type: "development_target", status: "researching",
      description: "Internal push to develop 2–3 outdoor formats before Q2. Map every creator with credible outdoors/survival/wildlife audience and existing sponsor relationships.",
      entities: [["interest", "Survival"], ["interest", "Wildlife"], ["sport", "Fishing"], ["vertical", "Outdoors"]],
      creators: [["Jake Holloway", "shortlist"], ["Skye Morales", "candidate"], ["Beau Tran", "candidate"]],
      formats: ["Wild Table", "Ocean Guardians"],
    },
    {
      title: "Northpeak Ambassador Expansion", type: "brand_brief", status: "in_discussion",
      description: "Northpeak wants two additional ambassadors in fitness/track with strong female Gen Z audiences.",
      entities: [["interest", "Fitness"], ["sport", "Track & Field"]],
      creators: [["Zoe Okafor", "shortlist"], ["Lena Brooks", "contacted"]],
      orgs: ["Northpeak Apparel"],
    },
    {
      title: "Podcast Network Expansion Research", type: "internal_research_question", status: "researching",
      description: "Which creators in the database have podcast experience but no current network deal? Feed candidates to Signal Grove conversation.",
      entities: [["vertical", "Business"], ["vertical", "Culture"]],
      creators: [["Emmy Chen", "candidate"], ["Colt Bergman", "candidate"], ["Deon Carter", "candidate"]],
      orgs: ["Signal Grove Audio"],
    },
  ];
  for (const o of oppDefs) {
    const slug = slugify(o.title);
    const existing = await db.opportunity.findUnique({ where: { slug } });
    const opp =
      existing ??
      (await db.opportunity.create({
        data: {
          slug, title: o.title, type: o.type, status: o.status,
          description: o.description, audienceRequirements: o.audienceRequirements,
          ownerId: admin.id,
        },
      }));
    if (existing) continue;
    for (const [kind, name] of o.entities ?? []) {
      await db.opportunityEntityLink.create({ data: { opportunityId: opp.id, entityId: ent(kind, name) } });
    }
    for (const [name, status] of o.creators ?? []) {
      await db.opportunityCreator.create({ data: { opportunityId: opp.id, creatorId: cr(name), status } });
    }
    for (const t of o.formats ?? []) {
      await db.opportunityFormat.create({ data: { opportunityId: opp.id, formatId: F[slugify(t)].id } });
    }
    for (const g of o.orgs ?? []) {
      await db.opportunityOrganization.create({ data: { opportunityId: opp.id, organizationId: org(g) } });
    }
  }

  // --- Collections -----------------------------------------------------------
  const collectionDefs: { name: string; description: string; items: [string, string][] }[] = [
    {
      name: "Priority Athlete Hosts",
      description: "Athletes and former athletes with proven hosting reps, ready for network conversations.",
      items: [["creator", "Maya Delgado"], ["creator", "Dre Watkins"], ["creator", "Lena Brooks"], ["creator", "Grant Foster"]],
    },
    {
      name: "Cooking Targets",
      description: "Everyone credible in the food vertical for the next brand sweep.",
      items: [["creator", "Sasha Kim"], ["creator", "Beau Tran"], ["creator", "Dre Watkins"], ["creator", "Jake Holloway"], ["format", "Wild Table"], ["format", "Cook for Coach"]],
    },
    {
      name: "Voltix World Cup Targets",
      description: "Working list for the Voltix soccer brief.",
      items: [["creator", "Maya Delgado"], ["creator", "Marcus Ohene"], ["format", "The Freestyle League"], ["organization", "Voltix Energy"]],
    },
  ];
  for (const cdef of collectionDefs) {
    const slug = slugify(cdef.name);
    const existing = await db.collection.findUnique({ where: { slug } });
    const collection =
      existing ??
      (await db.collection.create({
        data: { slug, name: cdef.name, description: cdef.description, ownerId: editor.id },
      }));
    if (existing) continue;
    for (const [type, name] of cdef.items) {
      const targetId =
        type === "creator" ? cr(name) : type === "format" ? F[slugify(name)].id : org(name);
      await db.collectionItem.create({
        data: { collectionId: collection.id, targetType: type, targetId },
      });
    }
  }

  // --- A saved view example --------------------------------------------------
  const savedViewCount = await db.savedView.count();
  if (savedViewCount === 0) {
    await db.savedView.create({
      data: {
        name: "LA Soccer Athletes",
        ownerId: editor.id,
        targetType: "creators",
        query: `entity=${ent("location", "Los Angeles")}&entity=${ent("sport", "Soccer")}&entity=${ent("creator_category", "Athlete")}`,
      },
    });
  }

  // --- Sources ---------------------------------------------------------------
  const sourceCount = await db.source.count();
  if (sourceCount === 0) {
    const s1 = await db.source.create({
      data: {
        title: "Streamline greenlights Street Pitch S3", url: "https://example.com/trades/street-pitch-s3",
        sourceType: "public", publication: "The Weekly Slate", addedById: editor.id,
      },
    });
    await db.recordSource.create({
      data: { sourceId: s1.id, targetType: "project", targetId: PR[slugify("Street Pitch")].id },
    });
    const s2 = await db.source.create({
      data: {
        title: "Rep call with Apex re: Maya availability", sourceType: "representative",
        notes: "Ava confirmed Maya is open to hosting Q3+.", addedById: admin.id,
      },
    });
    await db.recordSource.create({
      data: { sourceId: s2.id, targetType: "creator", targetId: cr("Maya Delgado") },
    });
  }

  // --- A little audit history so Activity isn't empty ------------------------
  const auditCount = await db.auditLog.count();
  if (auditCount === 0) {
    await db.auditLog.createMany({
      data: [
        { userId: editor.id, userName: "Sam Whitaker", targetType: "creator", targetId: cr("Maya Delgado"), targetLabel: "Maya Delgado", action: "created" },
        { userId: editor.id, userName: "Sam Whitaker", targetType: "project", targetId: PR[slugify("Street Pitch")].id, targetLabel: "Street Pitch", action: "created" },
        { userId: admin.id, userName: "Jordan Avery", targetType: "format", targetId: F[slugify("Athlete Boardroom")].id, targetLabel: "Athlete Boardroom", action: "updated", field: "status", oldValue: "developing", newValue: "pitched" },
      ],
    });
  }

  // --- Sports calendar -------------------------------------------------------
  const eventCount = await db.sportsEvent.count();
  if (eventCount === 0) {
    for (const def of SPORTS_CALENDAR) {
      const sportSlug = slugify(def.sport);
      const sport = await db.entity.upsert({
        where: { kind_slug: { kind: "sport", slug: sportSlug } },
        update: {},
        create: { kind: "sport", slug: sportSlug, name: def.sport },
      });
      await db.sportsEvent.create({
        data: {
          slug: slugify(`${def.title} ${def.start.slice(0, 4)}`),
          title: def.title,
          league: def.league ?? null,
          sportId: sport.id,
          startDate: new Date(def.start),
          endDate: def.end ? new Date(def.end) : null,
          location: def.location ?? null,
          notes: def.notes ?? null,
          approximate: !!def.approximate,
        },
      });
    }
    console.log(`Seeded ${SPORTS_CALENDAR.length} sports calendar events.`);
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
