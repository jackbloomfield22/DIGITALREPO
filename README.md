# 4.4.FORTY REPO

The one-stop information repository for 4.4.Forty Media: talent, existing
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

### Bulk talent import

Admin → Import takes a CSV of talent. Exports from creator platforms
(CreatorIQ and similar) can be uploaded as-is: column names are matched
loosely (`Creator Name`, `IG Followers`, `Eng. Rate`…), abbreviated counts
(`1.61M`, `646.95K`) are parsed, engagement rates are stored per account, and
one-row-per-network exports are merged into a single profile. Talent already in
the Repo is enriched rather than duplicated — blank fields fill in, follower
counts refresh, and existing text is never overwritten.

### Bulk knowledge upload

Admin → Bulk Upload loads a prepared `.json` **bundle** — organizations,
industry people, talent, projects, formats, and opportunities extracted from a
body of notes — straight from the browser. Use it whenever the data is too
large or too structured for Ingest, or when whoever prepared the bundle can't
reach the database directly (a sandboxed assistant, a laptop off the VPN).

How it works:

1. Pick the `.json` file. The Repo parses it, consolidates duplicates across
   the files inside it, and shows you a per-section count before anything is
   written. The bundle's own `title`/`url` prefill the source fields.
2. A full snapshot is taken (Admin → Backups) before the first write, so the
   whole load is reversible.
3. The load runs in small batches driven by the browser, with a progress bar.
   No single request does much work, so bundle size doesn't cause timeouts.
   Stopping mid-run is safe; pressing Import again resumes.

Every record is stamped with the source you named, so any fact traces back to
where it came from. The whole thing is **idempotent** — re-uploading the same
bundle creates nothing new, it only fills blanks and appends notes it hasn't
seen. Bundles hold confidential data and are gitignored; never commit one.

The same loader is available on the command line when the database *is*
reachable:

```bash
DATABASE_URL="postgres://…" IMPORT_BATCH_DIR=/path/to/batches \
  npx tsx scripts/import-drive-notes.ts            # load directly
DATABASE_URL="…" IMPORT_BATCH_DIR=/path/to/batches \
  npx tsx scripts/import-drive-notes.ts --bundle > my.bundle.json   # or package for the browser
```

### Environment variables

| Variable            | Required | Purpose                                                        |
| ------------------- | -------- | -------------------------------------------------------------- |
| `DATABASE_URL`      | yes      | Postgres connection string                                     |
| `AUTH_SECRET`       | yes      | Signs session cookies. **Production refuses to run without it** — there is no fallback secret. |
| `SIGNUP_CODE`       | prod: yes | The invite code required at `/signup`. **Sign-ups are closed in production until this is set** (this repo is public, so the code can't live in the source). A dev-only default applies locally. |
| `ANTHROPIC_API_KEY` | no       | Enables AI Search + Ingest triage/proposals. **The app is fully functional without it** — AI Search degrades to structured keyword search. |
| `ADMIN_EMAIL`       | no       | One or more emails (comma-separated; `ADMIN_EMAILS` also works). Each deploy promotes those accounts to ADMIN — accounts that don't exist yet are promoted once they sign up. |
| `BLOB_READ_WRITE_TOKEN` | no   | Auto-set when a Vercel Blob store is connected — every backup then also uploads an encrypted copy *outside* the database (decrypt with `scripts/decrypt-backup.mjs`) |
| `AI_MODEL`          | no       | Override the Claude model (default `claude-opus-5`)            |
| `AI_MODEL_TRIAGE`   | no       | Cheap model for ingest triage (default `claude-haiku-4-5`)      |
| `INGEST_RAW_CAP_MB` | no       | Raw-file retention cap in Postgres (default 4)                  |
| `CRON_SECRET`       | no       | When set, required on the backup and ingest cron endpoints      |

On hosted deploys the bootstrap seed generates random passwords for the demo
accounts (the admin one is printed once in the build log), and every build
rotates any demo account still carrying a public default password. Uploaded
attachments are stored in Postgres, so they survive serverless redeploys.

Team members create their own accounts at `/signup` with the team invite code (new members
join as editors; admins can adjust roles under Admin → Users). Everyone shares the one Repo, and every change
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

Ten first-class sections, all relational, all clickable in both directions:

- **Talent** — athletes, hosts, chefs, streamers, comedians, entrepreneurs… a person can
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
- **Sports Calendar** — upcoming US professional and major world sports events,
  month-by-month, filterable by sport, fully editable, with a curated standard calendar
  one click away.
- **Digital** (`/digital`) — the one place to look at the digital side: talent ranked by
  the audience they actually own (per platform or across all of them, with engagement and
  how fresh each number is), the formats built for those platforms, digital-native
  projects, the platforms and creator-owned companies, and the contacts inside them.
- **Archive** (`/archive`) — the Repo's long memory, and a first-class section rather than
  a back office one: most of the slate is finished, shelved or paused at any given moment,
  and this is where it lives. Search and filter across every record type, see what was
  archived, why, by whom and from which document, and Restore anything straight back onto
  the live lists — a format shelved on the slate comes back as a concept, so restoring
  actually puts it somewhere you can see it.
- **Collections & Saved Views** — hand-picked static lists vs. live filters that update as
  the database changes; both clearly labeled.

Underneath: a **canonical taxonomy** (interests, hobbies, sports, locations, genres,
creator categories, verticals, audience types, tags). No comma-separated text anywhere —
every relationship is a real row, deduplicated, with optional metadata (relationship type,
status, years, confidence, source).

### The experience

- **Talent directory is the homepage** — premium image cards (with rich hover
  intelligence + quick actions) or a dense, column-customizable table with bulk actions
  (add to collection, tag, status, CSV export, archive). Filters combine (interest AND
  location AND "has hosted") and live in the URL, so Back always restores your filters,
  sort, view, and position.
- **Talent profiles are dossiers** — bio, digital notes, socials with per-count freshness,
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

### Ingest (`/ingest`) — how the Repo stays current

Drop in emails (`.eml`, `.mbox`), documents (`.pdf`, `.docx`, `.pptx`, `.xlsx`), archives
(`.zip`), or pasted text. A staged pipeline — each stage a short serverless request —
parses deterministically (headers, quote-stripping, thread ids, attachments as child
items), **triages** with a cheap model (pure logistics gets filtered out), and
**proposes** structured changes grounded in the **Knowledge Digest**: a compact,
always-current index with one dossier card per record, kept fresh by hooks on every
mutation and searchable by trigram + full-text for candidate matching. Every proposal
carries verbatim evidence, confidence, a rationale, and a before/after diff; sensitive
items (fees, deal terms, personal details) sit in their own group, archives always need
explicit approval, and a colleague's intervening edit turns a proposal into a
`superseded` conflict instead of an overwrite. Applied changes are audited as ingest,
attributed with a Source link back to the document, and refresh the digest. The whole
vocabulary — editable fields, link kinds, digest recipes — derives from one registry
(`src/lib/ingest/registry.ts`), so the AI layer has no hand-written schema knowledge.
A daily cron (`/api/cron/ingest`) advances anything the in-browser runner left behind.

**The note box** (bottom right of every page) does what you ask rather than only writing
it down. "Put this on hold, ESPN passed", typed while looking at a format, comes back as
the concrete changes it would make in plain English — untick anything wrong, press Make
the change. It goes through the same pipeline, apply engine, audit trail and undo as
every other ingest; "Just save a note" still files it for later without touching anything.

**Status and archiving from the row.** The status pill in any directory list is the
control: pick a new status, or "Move to Archive", without opening the record. The same
pill sits on every card on the development slate.

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
src/lib/queries/talent.ts # directory filter/sort engine
src/lib/related.ts          # explainable related-record scoring
src/lib/ai/                 # AI tools, agent loop, research-inbox parsing
src/app/(app)/              # all authenticated pages
src/components/             # design system + client interactivity
tests/core.test.ts          # the core product guarantees
```


## How to add a new category

1. Add the vocabulary or record fields in `src/lib/taxonomy.ts` (statuses, roles, kinds).
2. If it is a new record type: add the Prisma model, then one entry in
   `src/lib/ingest/registry.ts` (fields, link participation, digest recipe, path).
3. Run the tests — coverage checks fail until backups (`src/lib/backup.ts`), the
   registry, and link specs all know about it. That is the entire wiring: the ingest op
   schema, validation, digest, and review UI derive from the registry at runtime.

## Testing

`npm test` covers the product's core guarantees: name-only talent creation, canonical
(non-duplicating) interests, bidirectional creator↔format and creator↔project-role links,
project↔organization symmetry, derived hosting experience, combined AND filtering,
duplicate suggestion scoring, entity merges preserving relationships, dynamic saved views,
role gating, optimistic-concurrency conflict rejection, and AI tool safety (read-only
surface, schema-validated inputs, clamped result sizes).

## Backups

The entire Repo — users, creators, every relationship, notes, sources, and
history — is snapshotted automatically **every day** (Vercel Cron → `/api/cron/backup`;
the newest 14 daily snapshots are kept). Admins can also take and download backups any
time under **Admin → Backups**; manual backups are kept until deleted. A downloaded
backup file restores a complete database:

```bash
DATABASE_URL="postgresql://..." npx prisma migrate deploy   # if the target is empty
DATABASE_URL="postgresql://..." node scripts/restore-backup.mjs backup.json
```

A test guards backup coverage: every model added to the schema must be included in the
dump or the suite fails. Hosted Postgres providers (e.g. Neon) additionally keep their
own point-in-time recovery as an independent safety net. Optional: set a `CRON_SECRET`
env var on Vercel to require authentication on the cron endpoint.
