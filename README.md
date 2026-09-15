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
| `BLOB_READ_WRITE_TOKEN` | no   | Auto-set when a Vercel Blob store is connected. Turns on real file storage (decks, PDFs, video up to 2GB; without it uploads fall back to Postgres at 15MB), and makes every backup also upload an encrypted copy *outside* the database (decrypt with `scripts/decrypt-backup.mjs`) |
| `AI_MODEL`          | no       | Override the Claude model (default `claude-opus-5`)            |
| `AI_MODEL_TRIAGE`   | no       | Cheap model for ingest triage (default `claude-haiku-4-5`)      |
| `AI_MODEL_TAGS`     | no       | The tagging pass at the end of every page update (default `claude-sonnet-5`) |
| `AI_MODEL_PAGE`     | no       | Model behind the on-page "Bring this page up to date" panel (default: same as `AI_MODEL`; set `claude-sonnet-5` to trade some judgement for speed) |
| `INGEST_RAW_CAP_MB` | no       | Raw-file retention cap in Postgres (default 4)                  |
| `CRON_SECRET`       | no       | When set, required on the backup and ingest cron endpoints      |
| `AIRTABLE_TOKEN`    | no       | Personal access token for the company Airtable base. Turns on the Airtable mirror: every format and project gets a row, with its files. See [`docs/airtable.md`](docs/airtable.md) |
| `AIRTABLE_BASE_ID`  | no       | The base to mirror into (`app…`). Can also be set on Admin → Airtable |

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

Twelve first-class sections, all relational, all clickable in both directions:

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
- **YouTube** (`/youtube`) — the athlete channels business as a knowledge base of its own,
  with its own sections: an **Overview** of where every channel stands and what needs
  chasing, **Channels** as a board or list, an **Ideas** queue across every channel,
  **Talent** split into who we run a channel for and who has a YouTube audience we
  haven't touched (computed, so adding a channel takes someone off it), **Partners** —
  the companies and people attached to channels — and a **Playbook** document.

  A channel has the pipeline it moves through (prospect → in talks → signed → building →
  live), numbers with the date they were taken (a subscriber count nobody has checked in
  two months is flagged), and a queue of ideas for what it could make, each with its own
  state from idea to published. Distinct from Formats, which are single shows: a channel
  is the place a run of them lives.

  Ingest routes material here on its own. Every document is told how to tell a channel from
  a format — a running channel for a person versus a single title, subscriber counts,
  handles, cadence — so channel material lands in this section whether or not anyone
  flagged it, and triage records which section it decided on. The **YouTube switch** on the
  upload panel is the stronger, document-level version: it asserts the *whole* document is
  channels material, which settles passages that would be ambiguous alone. A note written
  anywhere inside the section sets it automatically.

  An explicit switch always beats a guess — the guess only fills in where nobody chose. The
  review screen says which section an item was read as and whether that was worked out or
  set by hand, with one button to disagree: it drops the proposals and reads the document
  again the other way, because a wrong reading is not something approving and rejecting can
  fix.
- **Dev Slate** (`/dev-slate`) — the working development slate, kept in the Repo rather
  than linked from it, as a document you edit in place. It saves itself: there is no Save
  button, because a document with one is a document someone eventually loses work in. An
  exported slate (PDF, Word, or plain text) can be uploaded to replace it wholesale — the
  text is rebuilt into headings, labels and paragraphs — and the version it replaced is
  always kept, alongside a rolling history of substantial edits.
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
- **Keyboard** — `⌘K` palette, `/` search, `?` the shortcut list, `C` create, `G` then
  `T/P/C/F/O` to jump between sections, `J/K` `X` `Space` `Enter` on lists, `F` filters,
  and on a record `E` name, `S` status, `N` note, `L` link, `[` folds the Details column.
  Single keys never fire while you are typing; Escape cancels the editor first, then the
  palette or dialog, then the side panel, then a selection.
- **Show archived** — every list and the search page can include the Archive with one
  toggle; archived rows carry a pill and every page still works for an archived record.
- **⌘K command bar** — typo-tolerant global search across every type, grouped, plus
  create actions.
- **Edit in place** — every field on every record page is editable where it sits: click
  a value, type, press Enter (⌘Enter in a paragraph), Tab or click away. The change shows
  at once, a tick confirms the save, Undo lives in the toast, and a stale edit is refused
  with "changed by … just now" rather than silently overwriting a colleague's work. The
  record header carries the name, status, star, New note, Link, Verify and a menu with
  Merge, Archive, History and Copy link; a resizable Details column lists every field
  ("Show N empty fields" keeps it short); the main column is tabbed — Overview with
  Highlights, one tab per relationship type as a small table, and Activity.
- **Quick create** — `C` anywhere opens a sheet with only the essentials (name, status or
  type, a couple of starting fields); ⌘↩ saves and opens, ⌘⇧↩ saves and starts another;
  templates per type remember a set of select values. Inline "Create ‘X’" from any
  relationship picker, with duplicate suggestions before you fragment the graph.
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

**Files** — decks, PDFs, images, and video up to 2GB each — attach to talent, projects and
formats. They are stored in [Vercel Blob](https://vercel.com/docs/vercel-blob) rather than in
Postgres, and three details matter:

- **Private, not public.** The Repo holds unannounced projects and confidential deals, so
  blobs are stored private. Every read goes through `/api/attachments/[id]`, which checks the
  session and then redirects to a signed URL valid for an hour — a copied link doesn't outlive
  the session.
- **Served by redirect, not by proxy.** The bytes travel from Blob's CDN straight to the
  viewer, which is what makes scrubbing a two-hour cut work: range requests are handled there,
  not by a function paying for every byte.
- **Uploaded straight from the browser**, in parallel parts above 8MB, with a real progress
  bar. A serverless request body caps out at 4.5MB, so anything real would fail if it went
  through the app.

Video and audio play in place; PDFs preview in a frame; images show themselves. Set
`BLOB_READ_WRITE_TOKEN` (Vercel → Storage → Create → Blob) to switch it on. Without it the
Repo falls back to storing files in Postgres, capped at 15MB — enough for a PDF, not for a
cut — and Admin → Backups says so. Files served that way support range requests too, so
legacy attachments still scrub.

**Backups don't carry file contents.** A snapshot records every uploaded file — name,
type, size, and the record it hangs off — but not its bytes. Copying them in made each
daily backup larger than the Repo it protects (base64 inflates by a third, and fourteen
daily snapshots are kept), so 11MB of decks became ~50MB of database after three days and
kept growing on its own. Restoring brings back every record and every attachment's place;
the files themselves are re-uploaded, and asking for one that wasn't in the backup says so
instead of handing over an empty file. Admin → Backups shows the live storage breakdown.

**Bringing a page up to date.** Most of the Repo was imported from two years of old notes
and emails, so most pages are somewhere between stale and wrong — and nobody is going to
open an edit form four hundred times to fix that. Every record page carries a panel at the
top of its main column: say, loosely, where the thing actually stands, press *Show me the
changes*, and every change to the page comes back as before → after — a status as
strikethrough-then-new, a rewritten description as a word-level diff, a new connection as a
line — ticked by default, with one button to make them all. What you type is treated as
the truth over what the page says: where they disagree, the page is wrong, and stale values
are replaced rather than annotated. The panel then records that the page has been gone
over (so a sweep can be resumed after a break) and offers the next record alphabetically,
so the whole Repo can be worked through A to Z without going back to a list. Same pipeline
as every other ingest underneath, so every change is audited and undoable from Add Info.

The panel reaches every part of a page, not only its fields. Every column a record has is
editable by name, including list-valued ones like an organization's types or a name's
aliases. "Call it X" renames the page in place: the address stays, and the old name becomes
an alias so old links and searches still land. "She was never on this" removes a
connection; "it's back on" restores an archived record. And "this is actually a project" /
"he's an agent, not talent" / "this should be under YouTube" moves the page to the right
part of the Repo (`src/lib/convert.ts`): a new record of the right type with the fields
mapped across, every connection carried where the new type has a place for it (and written
into the notes where it does not, so nothing is lost), files, sources, favourites and
collection entries re-pointed, and the old page archived with a forwarding address —
its URL redirects to the new one. Each of these is an ingest op (`rename`, `unlink`,
`restore`, `convert`) alongside the original five, so the same review, audit and undo
apply: a move undone deletes the new record, puts the old one back on the live lists, and
returns everything that followed it.

**HQ.** One person's private operating system, at `/hq` and invisible to everyone else:
a Today page that works out what matters (overdue follow-ups, cards with no next step,
people going cold, meetings to prep for, three ideas resurfaced), a capture bar that files
a typed line as a task, follow-up, event, idea or note, a development pipeline with stages
and decision makers on top of the Repo's records, relationship intelligence with
conversation logs and touch cadences, a Brain that searches notes and the whole Repo
together and reads the question for the kind of answer wanted, an ideas archive, a Studio
that turns a style guide and examples into a brief for Claude, and a calendar with Google
sync built and waiting for credentials. Underneath, a mentions graph links every name in
anything written to the person, card or record it names, so every page shows what mentions
it; relationship strength and card momentum are computed from those links plus recency;
"waiting on" tasks nudge after five days; meetings get a prep sheet before and a one-box
debrief after; and a weekly review reads the journal back with push / park / drop.
Details in [`docs/hq.md`](docs/hq.md).

**Changes files.** The panel's reader costs an API call per page. The same proposals can be
written outside the site — by Claude in a chat, working from a downloaded backup and the
owner's page-by-page corrections — and dropped onto Add Info as a `.json` changes file. It
lands on the normal review board already proposed, with no model call: same before → after,
same tick-to-apply, same undo. The format and the workflow are in
[`docs/changes-file.md`](docs/changes-file.md).

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
- **Merging** — from any record's menu, pick a second record of the same type and choose
  which value survives field by field; every relationship, tag, file, source, star and
  collection membership is re-pointed to the kept record, the old name survives as an
  alias, and the losing record goes to the Archive untouched with a "merged into" pointer.
  Likely duplicates (near-identical names) are flagged at the top of the record page.
  Taxonomy entities are merged under Admin.
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
| Files      | Vercel Blob (private, signed reads) with a Postgres fallback for small files |
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
- **Optimistic concurrency** via a `version` column on all major records; every inline
  edit sends the version it read and is refused, naming who got there first, if the
  record moved on.
- **One write path per kind of change**: `setField` for a field, `addLink`/`removeLink`
  for a relationship, `bulkApply` for many rows at once, `mergeRecordsCore` for a merge,
  `archiveRecord`/`restoreRecord` for the Archive. Every one of them is a server action
  behind `requireRole`, writes an `AuditLog` row through `logAudit`, refreshes the
  Knowledge Digest and queues the Airtable mirror.
- **One way to look things up from the client**: the `Combobox` component over
  `/api/lookup`; one confirm dialog (`useConfirm`); one toast; one empty state; one
  skeleton. Design tokens live on `:root` in `src/app/globals.css`.

### Swapping in Supabase

The app runs on any Postgres, including Supabase's — point `DATABASE_URL` at it and run
migrations. Two adapters are intentionally isolated for a future swap: cookie auth
(`src/lib/auth.ts` → Supabase Auth) and file storage (`src/app/api/upload/route.ts` →
Supabase Storage). Nothing else knows how either works.

### Repository map

```
prisma/schema.prisma            # the knowledge-graph schema (start here)
prisma/migrations/              # one folder per migration; each ships a down.sql from Phase 3 on
prisma/seed.ts                  # fictional demo world
scripts/vercel-build.mjs        # the Vercel build: resolve the DB URL, migrate, seed, build
src/lib/taxonomy.ts             # every controlled vocabulary (roles, statuses, kinds)
src/lib/ingest/registry.ts      # which fields each record type has — inline editing,
                                #   the details panel, ingest and merge all read it
src/lib/record-fields.ts        # field coercion/plain values shared by server and client
src/lib/actions/                # all mutations (server actions, role-gated, audited)
src/lib/actions/inline.ts       #   setField — the inline-edit write path
src/lib/actions/bulk.ts         #   bulk changes with a batch id and one-shot undo
src/lib/merge-records.ts        # merge two records; foreign keys found via Prisma's metadata
src/lib/filters.ts, filter-where.ts  # the URL filter model and its Prisma translation
src/lib/queries/talent.ts       # the talent directory's filter/sort engine
src/lib/repo-search.ts, search-rank.ts  # trigram search over the digest + ranking
src/lib/prefs.ts                # per-person preferences (density, columns, templates…)
src/lib/db-model.ts             # the one place a model name becomes a Prisma delegate
src/lib/ai/                     # AI tools, agent loop, research-inbox parsing
src/app/(app)/                  # all authenticated pages; [slug] routes are record pages
src/app/api/                    # lookup, peek, command, attachments, cron endpoints
src/components/                 # the design system + client interactivity
src/components/record-*.tsx     #   record page chrome: header, layout, tabs, activity, footer
src/components/inline-field.tsx #   click-to-edit for any registry field
src/components/combobox.tsx     #   the one typeahead
tests/                          # vitest against a live Postgres (serial)
docs/                           # airtable.md, hq.md, changes-file.md
```

## Migrations and the production database

Production is Postgres on Neon, connected to the Vercel project. **Migrations run on
every deploy**: `scripts/vercel-build.mjs` runs `prisma migrate deploy` before `next build`,
so anything merged to `main` reaches the production schema on the next deploy.

- Locally: `npm run db:migrate` (`prisma migrate dev`) creates and applies a migration
  from schema changes; `npm run db:reset` rebuilds from scratch with demo data.
- Every migration is additive first: new tables and nullable columns, a backfill, then the
  app switches over; old columns are dropped only in a later migration once the new path
  has run in production. Nothing in the app deletes records — Archive is the only way out.
- Before a schema migration ships to production, take a Neon branch of the database from
  the Neon console (Branches → Create branch from `main`) so the state before the change
  is one click away. The refresh pass keeps schema changes on the working branch until that
  branch exists (see `AUDIT.md`).
- Rolling back: restore the Neon branch, or apply the migration's `down.sql` by hand with
  `psql` against the direct (unpooled) connection string.

## Options, custom fields, verification and history

- **Options today** live in `src/lib/taxonomy.ts` — statuses, roles, types, relationship
  kinds — and are referenced by their stable snake_case value everywhere (`in_production`,
  never a label). Adding a value there is all it takes; labels derive from the value. Every
  select in the app (the Details panel, quick-create, the filter picker, bulk "Set field…",
  ingest's review forms) reads the same list through the registry. Phase 3 of the refresh
  moves these lists into an `Option` table with rename/reorder/archive/merge under
  Settings → Options and "Create ‘X’" inside every select; it is built on the working branch
  behind the migration rule above.
- **Custom fields** arrive with the same migration (`FieldDefinition` + a `custom` JSONB
  column per record type); until then the registry's field list is the field list.
- **Verification**: talent carries `lastVerifiedAt` and a Verify button; a profile not
  verified in six months shows "Needs review". Phase 3 extends owner / verified-at /
  verified-by to every record type, with a Health page.
- **History**: every mutation writes one `AuditLog` row (who, what, field, before, after,
  when) through `logAudit`, which also refreshes the Knowledge Digest. A record's Activity
  tab, the Activity page, the "changed by … just now" conflict message, the record footer
  and merge all read from it. Bulk changes share a batch id and undo as one; inline edits
  undo from their toast.

## How to add a new category or record type

1. Add the vocabulary in `src/lib/taxonomy.ts` (statuses, roles, kinds) — pickers,
   filters, bulk edit and ingest pick it up at once.
2. For a new record type: add the Prisma model and a migration, then one entry in
   `src/lib/ingest/registry.ts` (fields, name field, path, link participation). The
   record page chrome, inline editing, the details panel, quick-create, merge, search and
   ingest all derive from that entry.
3. Run the tests — coverage checks fail until backups (`src/lib/backup.ts`), the
   registry and link specs all know about it.

## Testing

`npm test` runs against a live Postgres (serially) and covers the product's core
guarantees: name-only talent creation, canonical (non-duplicating) interests, bidirectional
links, derived hosting experience, filters and their URL model, search ranking, inline
field coercion and version conflicts, merges re-pointing every relationship and archiving
the loser with a pointer, bulk changes, the quiet timer, the Airtable mirror against a fake
Airtable, ingest parsing and apply, backups, and AI tool safety.

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
