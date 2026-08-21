# 4.4.FORTY DIGITAL BIBLE

The living intelligence system for 4.4.Forty Media: creators, digital talent, existing
projects, companies, formats, relationships, interests, opportunities, and institutional
knowledge — deeply interconnected so that nearly every useful piece of information leads
naturally to another discovery.

Research → relationships → discovery → opportunity.

---

## Quickstart

Requirements: **Node 20+**, **PostgreSQL 16** (or Docker).

```bash
# 1. Install dependencies
npm install

# 2. Start Postgres (skip if you already have one)
docker compose up -d

# 3. Configure environment
cp .env.example .env          # defaults match docker-compose

# 4. Create schema and load fictional demo data
npx prisma migrate dev
npm run db:seed

# 5. Run
npm run dev                   # http://localhost:3000
```

### Demo accounts

| Email              | Password    | Role                                              |
| ------------------ | ----------- | ------------------------------------------------- |
| `admin@440.media`  | `admin440`  | ADMIN — users, merging, data health, archive      |
| `editor@440.media` | `editor440` | EDITOR — create and edit everything               |
| `viewer@440.media` | `viewer440` | VIEWER — read and search only                     |

All demo people, companies, and shows are fictional; overlaps (shared sports, cities,
production companies, brands) are intentional so relational discovery has something to
discover.

### Environment variables

| Variable            | Required | Purpose                                                        |
| ------------------- | -------- | -------------------------------------------------------------- |
| `DATABASE_URL`      | yes      | Postgres connection string                                     |
| `AUTH_SECRET`       | yes      | Signs session cookies (set a strong value in production)       |
| `ANTHROPIC_API_KEY` | no       | Enables AI Search + Research Inbox parsing. **The app is fully functional without it** — AI Search degrades to structured keyword search. |
| `AI_MODEL`          | no       | Override the Claude model (default `claude-opus-5`)            |
| `SIGNUP_CODE`       | no       | Overrides the built-in invite code required at `/signup`        |

Team members create their own accounts at `/signup` with the team invite code (new members
join as editors; admins can adjust roles under Admin → Users). Everyone shares the one Digital Bible, and every change
is attributed to the account that made it in the audit history and Activity feed.

On Vercel, the build (`scripts/vercel-build.mjs`) auto-detects the database connection
string from Neon, Supabase, or Vercel/Prisma Postgres marketplace integrations, runs
migrations, and seeds a fresh database automatically.

### Scripts

| Command             | What it does                             |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Dev server                               |
| `npm run build`     | Production build                         |
| `npm start`         | Serve the production build               |
| `npm run db:migrate`| Apply Prisma migrations                  |
| `npm run db:seed`   | Load demo data (idempotent)              |
| `npm run db:reset`  | Drop, re-migrate, and re-seed            |
| `npm test`          | Core product test suite (needs the DB)   |
| `npm run lint`      | ESLint                                   |
| `npm run typecheck` | TypeScript                               |

---

## What's inside

### The object model

Seven first-class objects, all relational, all clickable in both directions:

- **Creators** — athletes, hosts, chefs, streamers, comedians, entrepreneurs… a person can
  hold multiple categories. Only a name is required to create one; profiles enrich gradually.
- **Projects** — *real existing productions* (series, podcasts, docs, competition shows).
  Creator↔Project links always carry **roles** (Host, EP, Contestant, Subject…), which power
  derived experience ("Hosted 4 · Executive Produced 2") and searches like *athletes who have
  already hosted television* — nothing is manually tagged.
- **Formats** — *internal 4.4.Forty concepts* with a development status pipeline. Visually
  distinguished from projects everywhere (`EXISTING PROJECT` vs `4.4.FORTY FORMAT` badges).
- **Organizations** — production companies, studios, networks, streamers, brands, agencies,
  leagues. An org page shows every project, every directly-related creator, every creator
  connected *through its projects*, and (for agencies) all represented talent.
- **Industry People** — agents, managers, publicists, executives; representation is
  structured (Creator → Person → Agency) and navigable from every side.
- **Opportunities** — brand briefs, casting needs, development targets. Criteria are taxonomy
  entities, so the system suggests matching creators deterministically **with explained
  reasons**, never mystery percentages.
- **Collections & Saved Views** — hand-picked static lists vs. live filters that update as
  the database changes; both clearly labeled.

Underneath: a **canonical taxonomy** (interests, hobbies, sports, locations, genres,
creator categories, verticals, audience types, tags). No comma-separated text anywhere —
every relationship is a real row, deduplicated, with optional metadata (relationship type,
status, years, confidence, source).

### The experience

- **Creator directory is the homepage** — premium image cards (with rich hover
  intelligence + quick actions) or a dense, column-customizable table with bulk actions
  (add to collection, tag, status, CSV export, archive). Filters combine (interest AND
  location AND "has hosted") and live in the URL, so Back always restores your filters,
  sort, view, and position.
- **Creator profiles are dossiers** — bio, digital notes, socials with per-count freshness,
  interests/sports as clickable chips, projects with roles, formats, business & investments,
  brand relationships, collaborators, representation, sources, attachments, opportunity
  notes, version history — plus a right rail with derived experience, opportunity
  connections, and explained related creators.
- **Everything useful is clickable** — `Soccer`, `Los Angeles`, a brand, a production
  company, a rep. Entity pages aggregate creators/projects/formats plus co-occurrence
  intelligence (common locations, common orgs, related interests) and jump straight into
  the filtered directory.
- **⌘K command bar** — typo-tolerant global search across every type, grouped, plus
  create actions.
- **Quick everything** — quick preview drawer (evaluate without navigating), quick edit
  drawer (statuses, counts, chips), inline "Create ‘X’" from any relationship picker with
  duplicate suggestions before you fragment the graph. Small edits autosave with Undo
  toasts; big edits use explicit Save (⌘S), unsaved-changes warnings, and optimistic
  concurrency — a stale edit can never silently overwrite a colleague's work.
- **Print / One-Sheet + Copy Summary** — replaces the Google Docs workflow.

### AI (optional, never load-bearing)

`/ai` is a conversational research surface. The model gets **read-only, validated,
server-side tools** (`search_creators`, `get_organization`, `find_creator_connections`, …)
— never raw SQL, never writes. It's instructed to treat the database as the source of truth,
to say "not in the database" rather than invent, and to label inferences. Answers come with
clickable result cards back into the normal UI, and follow-up questions keep thread context.

The **Research Inbox** (`/inbox`) is how the database stays current: paste anything —
an announcement, notes from a call, a whole one-sheet — and AI proposes structured changes
(create project X, link creator Y as Host, add org Z as production company…). Nothing
touches canonical data until an editor clicks **Apply**; applied names are resolved against
existing records so duplicates aren't created.

Without an API key, AI Search falls back to structured keyword search and the inbox still
captures notes.

### Admin

- **Data Health** — likely duplicates (fuzzy name matching), never-verified/stale profiles,
  stale social counts, creators without interests/projects/sources, orphaned projects,
  archived records with restore.
- **Merging** — merge duplicate organizations or taxonomy entities; every relationship is
  re-pointed to the kept record, the old name survives as an alias, history is preserved.
- **Users** — create users, assign VIEWER / EDITOR / ADMIN.
- **CSV Import** — bulk creator migration with a downloadable template, preview, and
  duplicate skipping.

Every meaningful change lands in the **audit log** (who/what/when, old → new), which powers
the Activity feed and per-record history.

---

## Architecture

| Layer      | Choice                                                                   |
| ---------- | ------------------------------------------------------------------------ |
| Framework  | Next.js 16 (App Router), React 19, TypeScript                            |
| Styling    | Tailwind CSS v4, custom editorial design system (no component library)   |
| Database   | PostgreSQL 16 via Prisma — ~40 tables, proper FKs/uniques/indexes        |
| Auth       | Signed HTTP-only cookie sessions (jose), bcrypt passwords, server-enforced roles |
| AI         | Anthropic SDK (`claude-opus-5`) with a manual tool-use loop over read-only DB tools |
| Files      | Local `uploads/` served through an authenticated route handler           |
| Tests      | Vitest against a live database                                           |

Key implementation notes:

- **Server components + server actions.** Pages query Prisma directly with `include`
  (no N+1); mutations are server actions that all pass through `requireRole()` — permission
  enforcement never trusts the client.
- **One generic link engine** (`src/lib/actions/links.ts`) handles every relationship in the
  graph with a validated discriminated union: idempotent upserts (adding Soccer twice can't
  duplicate), symmetric creator↔creator normalization, audit entries, and undo support. One
  UI component (`LinkChips`) renders and edits any relationship anywhere.
- **Directory state lives in the URL** — filters, sort, view, page — which is also what
  makes Saved Views trivially dynamic: they store the querystring, not the results.
- **Related creators / related projects** are computed with weighted, *explainable* signals
  (direct collaboration > shared project > shared format > shared niche interest > shared
  org > same rep > same location > same broad category).
- **Optimistic concurrency** via a `version` column on all major records.

### Swapping in Supabase

The app runs on any Postgres, including Supabase's — point `DATABASE_URL` at it and run
migrations. Two adapters are intentionally isolated for a future swap: cookie auth
(`src/lib/auth.ts` → Supabase Auth) and file storage (`src/app/api/upload/route.ts` →
Supabase Storage). Nothing else knows how either works.

### Repository map

```
prisma/schema.prisma        # the knowledge-graph schema (start here)
prisma/seed.ts              # fictional demo world
src/lib/taxonomy.ts         # every controlled vocabulary (roles, statuses, kinds)
src/lib/actions/            # all mutations (server actions, role-gated, audited)
src/lib/queries/creators.ts # directory filter/sort engine
src/lib/related.ts          # explainable related-record scoring
src/lib/ai/                 # AI tools, agent loop, research-inbox parsing
src/app/(app)/              # all authenticated pages
src/components/             # design system + client interactivity
tests/core.test.ts          # the core product guarantees
```

## Testing

`npm test` covers the product's core guarantees: name-only creator creation, canonical
(non-duplicating) interests, bidirectional creator↔format and creator↔project-role links,
project↔organization symmetry, derived hosting experience, combined AND filtering,
duplicate suggestion scoring, entity merges preserving relationships, dynamic saved views,
role gating, optimistic-concurrency conflict rejection, and AI tool safety (read-only
surface, schema-validated inputs, clamped result sizes).
