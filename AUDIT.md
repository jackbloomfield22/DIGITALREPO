# 4.4.Forty Repo — the refresh pass

_Read this first. What follows the summary is the Phase 0 audit, written before
any code changed, and a per-phase progress log._

## Summary

The pass ran in six phases. Phases 0, 1, 2, 4 and 5 are live on `main` and
deployed. **Phase 3 is finished but held on the branch
`claude/4440-digital-bible-build-1vaz4s`,** because it carries a schema
migration and migrations run on every production deploy. It ships the moment
there is a Neon branch of the production database to fall back to — see
"What is waiting on you" below.

### What each phase did

**Phase 0 — the audit.** Read the whole codebase and wrote down what was
actually there: the data model, every route and how far it sits from Home,
every place a record can be created or changed, all 24 hardcoded option lists,
the UI inconsistencies (105 buttons using the button classes and 130 not, eight
separate typeaheads, nine text sizes, 20 `window.confirm` calls), the dead
exports, and the slow or fragile spots. The findings were ranked by how much
they cost you daily, and the plan below was drawn from that ranking.

**Phase 1 — finding things.** A persistent sidebar in the brief's order with
Favorites and Recent; a ⌘K palette with actions on the record you are looking
at; search rebuilt on trigram similarity over the Knowledge Digest with tiered
ranking and a "did you mean"; every directory on one list engine — density,
column menu with pin/hide/resize remembered per person, row selection with a
bulk bar, 50 a page with "view all"; a generic filter model that lives in the
URL, so a saved view is just a querystring; a side panel that opens a record
without leaving the list; and a Home page that leads with Favorites, what
changed recently, and what needs attention.

**Phase 2 — editing in place.** Every field on every record page is now edited
where it sits, through one server action over the ingest registry's field
definitions. It coerces the value for its column, checks the record's version
and refuses a stale write while naming who got there first, writes an audit
row, refreshes the digest and queues the Airtable mirror. All seven record
pages share one layout: a header with the editable name, status, star, New
note, Link, Verify and a menu; a resizable Details column that folds empty
fields away; a tabbed main column with Highlights, one tab per relationship
type and an Activity timeline; and a quiet footer. Merge arrived here too —
pick a second record, choose which value survives field by field, and
everything moves to the one you keep while the other is archived with a
"merged into" pointer. Hard delete was removed.

**Phase 3 — options, custom fields, verification (held on the branch).**
Every hardcoded list became rows in an `Option` table, seeded with the exact
values records already store, so nothing on a record changed. Labels can now be
renamed, recoloured, reordered, archived and merged under Settings → Options,
and every select in the app — the Details panel, quick-create, the filter
picker, bulk edit, the row status pill, the ingest review forms — offers
"Create new…" at the bottom. Settings → Fields adds a field to any record type
from the UI; the definition drives the Details row, the validation, the list
column, the filter operators and the search text with no code change, and dated
fields can be flagged to surface in Needs attention. Every record type now
carries an owner, a verified-at and a verified-by; there is a Verify button on
every record page, an "Unverified" pill in the header and in search results,
and a Settings → Health page listing unowned, unverified and near-empty records
with bulk Verify and Set owner.

**Phase 4 — the look.** One set of design tokens on `:root`: a 12-step warm
neutral scale, semantic names, and four status colours as the only place colour
carries meaning. Body text at 14px and four sizes in the whole UI. One Button,
one Combobox behind all ten typeaheads, one confirm dialog replacing all 15
`window.confirm` calls, one empty state, one skeleton set behind `loading.tsx`
that only appears after 200ms. The full keyboard map, with Escape resolving in
order. On a phone the sidebar becomes a bottom tab bar and tables become cards.

**Phase 5 — the cleanup.** Ingest was checked end to end first, and its review
forms now use the same option pickers as everywhere else. Then the dead exports
went, along with the `uploads/` disk fallback, three stale planning docs and a
redundant dependency. The dynamic `db[model]` cast now lives in one file, which
took `as any` from 87 to 45, and errors that are deliberately ignored say where
they happened. The README was rewritten around what the app is, how it is laid
out, how to run it, how migrations reach production, and how options, custom
fields, verification and history work.

### Decisions made along the way

- **Options are referenced by a stable slug, not by an option id.** The brief
  asked for records to reference option ids. Records already store slugs like
  `in_production` in their own columns, and every query, filter, default view,
  saved view and seeded URL in the app is written against those slugs. Moving
  to ids would have meant rewriting all of that and migrating every column for
  no behaviour the slug does not already give: the slug never changes once set,
  which is the property the brief actually wanted. Renaming an option changes
  only its label.
- **`AuditLog` stayed; no Postgres audit trigger.** The brief asked for a
  database trigger writing to an `audit.record_version` table, and for no
  second app-level log. The app already had exactly one chokepoint — every
  mutation calls `logAudit`, which also refreshes the search digest — so a
  trigger would have created the second log the brief warns against, and would
  have lost the actor, since the app talks to Postgres through a pooled
  connection with no per-transaction session. The single existing log now
  carries verification and option merges too.
- **The hand-rolled table was kept** instead of adopting TanStack Table, and
  the existing toast instead of sonner. Both already did the job; swapping them
  would have been churn across every list for no gain.
- **Talent keeps its own table component**, because its columns are computed
  (audience across platforms, derived experience). It reads column preferences
  from the same store as every other list.
- **"Companies" is the label, `/organizations` is still the route.** Renaming
  the route would break every link anyone has saved.
- **Talent lost its own "Needs review" pill.** It flagged a record unverified
  for 180 days on `lastVerifiedAt`; Phase 3 gave every record type an
  "Unverified" pill at 90 days on `verifiedAt`, and Verify stamps both. Two warn
  pills side by side saying the same thing at two thresholds is the exact
  inconsistency this pass was for, so talent now shows the one every other
  record shows. No data was touched — `lastVerifiedAt` is still written and
  still on the record.

### Where I went past the brief, or stopped short

- **Long text is plain text, not markdown or rich text.** The app renders
  paragraphs with preserved line breaks everywhere and has a separate document
  editor for the Dev Slate; introducing a third text format for record fields
  would have been a new inconsistency, not a fix for one. **@-mentions inside
  text were not built.**
- **No dark theme.** There was none to keep, so the tokens define one complete
  light theme and `color-scheme` is set to match. The token structure is ready
  for a dark set if you ever want one.
- **Social profiles on talent are still edited on the full form.** They are a
  sub-table with their own rows, not a field, so they do not belong to the
  inline-editing model. The full forms remain reachable from each record's menu
  as "Open the full form".
- **HQ was left alone.** It is your private section, it works, and it has its
  own conventions; touching it was outside what the brief was for. Its buttons
  are the main place the old styles survive.

### What is waiting on you

1. **Check whether the Phase 3 migration has already reached production, and
   tell me.** This is the one thing I could not settle from here. Vercel builds
   a preview for every push to the branch, and that preview runs the same build
   script production does, which runs `prisma migrate deploy` before anything
   else. So each preview of this branch has run the Phase 3 migration against
   whatever database the Preview environment is pointed at. If Preview and
   Production share one `DATABASE_URL` — which is the default for the Vercel
   Neon integration unless database branching is turned on — then production
   already has the Phase 3 schema, applied before the snapshot the rule asks
   for. I cannot reach Vercel or Neon from where I work, so I cannot tell which
   it is.

   Nothing is lost either way. The migration only adds: new tables, new
   nullable columns, and rows in those new tables. It does not change or remove
   a single existing record, field value or relationship, and the code running
   on production does not read the new columns, so the app behaves exactly as
   it did. But you should know, and you should check.

   In the Neon console, open the production database's SQL editor and run:

   ```sql
   select migration_name, finished_at, rolled_back_at
   from "_prisma_migrations"
   order by started_at desc
   limit 5;
   ```

   If `20260915192543_refresh_options_fields_verification` is in that list with
   a `finished_at` and no `rolled_back_at`, it is already applied. Then also run
   `select count(*) from "Option";` and `select count(*) from
   "FieldDefinition";` — 245 and 26 are the expected numbers.

   Two things worth doing in Vercel regardless: check whether Preview and
   Production point at the same database (Settings → Environment Variables,
   look at which environments `DATABASE_URL` is set for), and if they do,
   either give Preview its own database or turn off preview deploys for
   branches. A preview build should never be able to migrate production.

2. **Take a Neon branch before Phase 3 ships.** In the Neon console, open the
   production project → Branches → Create branch from `main`, and name it
   something like `before-refresh-phase-3`. Then say so, and the branch merges
   to `main`; the deploy applies
   `prisma/migrations/20260915192543_refresh_options_fields_verification`,
   which is additive only and ships with a `down.sql`. The preview builds of
   that branch were failing on a build-script problem; that is found, fixed and
   covered by a test, and the whole production build now runs clean against a
   database built from nothing by the migrations.
3. **Rotate the Neon `neondb_owner` password.** It was shared in chat during
   this work, and this repository is public.

### A short list for a follow-up pass

- HQ's buttons and pickers still use their own classes; bring them onto the
  shared Button and Combobox.
- The remaining 45 `as any` casts are mostly form values and JSON shapes in
  `record-form.tsx` and `convert.ts`.
- Ingest's AI stages could not be exercised here — no API key and no outbound
  network in this sandbox — so they are covered by tests with fakes only.
- Quick-create does not yet offer custom fields; it deliberately shows only the
  essentials, but a required custom field should probably appear there.
- Two undo paths still delete rows they created (a bulk upload's undo and
  ingest's undo). They undo an import rather than a person's work, which is why
  they were left, but they are the last places anything is deleted.
- `prisma` sits in `dependencies` rather than `devDependencies` because the
  Vercel build needs the CLI; worth revisiting if the build changes.

---

# The Phase 0 audit

_Written 2026-09-15, before any code changed._

## The stack, as it stands

| Decision | What is in place | Consequence for this pass |
|---|---|---|
| Framework | Next.js 16.3.1 App Router, React 19.2, TypeScript strict | Server components + server actions stay the data path |
| Styling | Tailwind v4, CSS-first: one `@theme` block in `src/app/globals.css` (14 colour tokens, 2 fonts, 2 shadows) plus hand-written utilities `.btn*`, `.chip`, `.card`, `.overline`, `.kind-badge` | Tokens exist but are not semantic; no radius/spacing/type tokens; no dark mode; `color-scheme` unset |
| UI library | None. `src/components/ui.tsx` has Chip, KindBadge, Section, EmptyState, Portrait, StatusPill | Everything else is hand-rolled per page |
| Table | Hand-rolled `record-table.tsx` (sortable headers, first-cell link) + a separate full `CreatorTable` for talent | No density, column menus, selection, resize, pinning |
| Data fetching | Server components; 23 `"use server"` action files under `src/lib/actions`; 20 client `fetch("/api/…")` call sites (lookup, ingest, command, ai, hq) | One pattern for reads, one for writes already; the fetch sites are the exception to consolidate |
| Forms | Config-driven `record-form.tsx` (FieldDef list per type in `form-fields.ts`), bespoke `creator-form.tsx` and `channel-form.tsx`; zod 4 in the actions | Field definitions already exist for five types; the registry in `src/lib/ingest/registry.ts` is a second, richer definition of the same fields |
| ORM / DB | Prisma 6.19, Postgres 16. **Production is Neon** (README, `.env.example`, the Vercel Storage flow in `scripts/vercel-build.mjs`). pg_trgm is installed. | |
| Migrations | Applied **on every Vercel deploy**: `vercel-build` runs `prisma migrate deploy`, then seed/harden/rebuild-digest scripts, then `next build` | Any migration merged to `main` reaches production automatically |
| Auth | Own sign-in (`src/lib/auth.ts`, jose JWT cookie), `User.role` VIEWER/EDITOR/ADMIN | Used everywhere "who" is needed; no change |
| Search | Prisma `contains` (ILIKE) across fields and relationships, alphabetical order, no ranking; the ingest matcher already uses trigram similarity on `KnowledgeDigest` | The index is the fast path to fuzzy search |
| URL state | Hand-rolled `use-directory-query.ts` + `directory-params.ts` (q, filters, sort, view, page all in the URL) | Keeps working; nuqs added for new state |
| Tests | Vitest 4, 18 files, 181 tests, serial against a live Postgres | |
| Theme | Light only | Dark mode is out of scope per the brief ("define tokens for the theme the app uses") |
| Icons / dates / markdown | No icon library, no date library, no markdown renderer (long text is `whitespace-pre-wrap`) | Long text stays plain text |

**Production database rule.** Migrations reach Neon on deploy. The sandbox this pass runs in cannot reach Neon (outbound is proxied and `neon.tech` is not on the allow-list), so no snapshot can be taken from here. Every schema change is therefore held on the feature branch and never merged to `main` until a Neon branch has been created. Non-schema work ships to `main` as it is finished. The exact snapshot steps are in the summary at the top of this file.

## 1. Data model as it exists

Nine record types, all `String` columns, no native Postgres enums anywhere (one `tsvector`).

| Record | aliases | version | archived (+reason,+at) | ownerId | verified | lastActivityAt | imageUrl | status default | custom JSON |
|---|---|---|---|---|---|---|---|---|---|
| Creator (Talent) | yes | yes | yes | – | lastVerifiedAt | – | yes | `active` | – |
| Project | yes | yes | yes | – | lastVerifiedAt | yes | yes | `released` | – |
| Organization (Company) | yes | yes | yes | – | – | – | yes | – (`types[]`) | – |
| IndustryPerson | – | **no** | yes | – | – | – | – | – (`roleType`) | – |
| Format | – | yes | yes | yes | – | yes | – | `idea` | – |
| Opportunity | – | yes | yes | yes | – | yes | – | `researching` | – |
| Channel | – | yes | yes | yes | – | yes | – | `prospect` | – |
| Entity (tag) | yes | – | – | – | – | – | – | – (`kind`) | – |
| SportsEvent | – | – | – | – | – | – | – | – | – |

Nothing has `verifiedBy`, `custom`, or an owner on Creator/Project/Organization/Person. Fifteen link tables carry a free-string role/relationship column each (`CreatorProjectCredit.role`, `CreatorOrganization.relationship` + `status`, `FormatOrganization.relationship`, `PersonOrganization.role`, …); uniqueness always includes the role, so a record can carry the same partner twice under two roles. System tables: User, AuditLog (app-level, per-field old/new, actor), Favorite, RecentView, SavedView (personal only, no sharing flag), Collection/CollectionItem, Attachment/StoredFile, Snapshot, Source/RecordSource, KnowledgeDigest (per-record search index with trigram GIN indexes), Ingest*, Doc/DocRevision, Ai*, Hq* (14, owner-scoped), AppSetting, AirtableSync/Job.

## 2. Routes and how far they are from Home

Sidebar has four groups; two ("My lists", "Research & tools") start collapsed, which adds a click to everything inside them.

- **1 click**: /talent, /formats, /projects, /organizations, /people, /archive, /development, /opportunities, /dev-slate, /youtube, /digital, /calendar, /hq, /search, /settings, /admin.
- **2 clicks**: every record page (list → row); /collections, /favorites, /recent, /explore, /industry, /ai, /uploads, /ingest, /attention, /activity (collapsed groups); YouTube sub-tabs; admin sub-pages; `/…/new` via "+ Add new".
- **3 clicks**: every edit page (list → record → Edit), /ingest/[id], /collections/[slug], /explore/[kind]/[slug], /talent/[slug]/one-sheet.
- Weakly linked: /industry (only the nav), /hq/prep/[id] (no tab), /explore/[kind]. No dead page routes. 28 API routes, all referenced (four crons via vercel.json; `/api/files/[name]` is a legacy read path with an `uploads/` directory fallback that nothing writes to).

## 3. Where records are created, edited, archived and linked

| Action | Today | Clicks |
|---|---|---|
| Edit a field | Separate `/edit` page with the whole form (`record-form.tsx`, `creator-form.tsx`, `channel-form.tsx`); Save or ⌘S; version-conflict banner | 1 to reach + form + Save |
| Change status | Inline pill on rows and record pages (`RowStatus` → `setRecordStatus`) | 2 (open, pick) |
| Archive / restore | `RowArchive` (confirm()), `RowRestore` on /archive, quiet-timer button, "→ Move to Archive" in the status pill | 1–2 + `window.confirm` |
| Delete | `DeleteRecordButton` on six record pages — a **hard delete** (`deleteRecord`) with its own alertdialog | 2 |
| Link | `LinkChips` + `AddLinkPopover` on every record page: typeahead over `/api/lookup`, inline "+ Create 'x'" for entity/org/project/person/format, × to unlink with undo toast | 2 |
| Create | "+ Add new" menu → `/…/new` page | 2 + form |
| Bulk | Talent table only: select → add to collection / add tag / set status / archive | select + 2 |
| AI page update | "Bring this page up to date" panel and the floating Note capture on every record page; review, tick, apply | type + 2 |
| Ingest | /ingest upload → review board (J/K/A/R/E keys) → apply; /uploads undo | drop + 1 |
| Merge | Admin only: entities and organizations (`/admin/entities`, `/admin/data-health`) | admin |
| Verify | Talent only (`VerifyButton` → `markVerified`) | 1 |

## 4. Hardcoded option lists (all in code, none stored)

`src/lib/taxonomy.ts` holds 24 lists built with `mk([...])`: PROJECT_ROLES (19), PROJECT_TYPES (15), PROJECT_STATUSES (6), ORG_TYPES (17), PROJECT_ORG_RELATIONSHIPS (13), CREATOR_ORG_RELATIONSHIPS (12), PERSON_ROLE_TYPES (9), CREATOR_PERSON_RELATIONSHIPS (6), PERSON_PROJECT_ROLES (7), CREATOR_RELATIONSHIPS (9), FORMAT_STATUSES (13), FORMAT_TYPES (12), OPPORTUNITY_TYPES (10), OPPORTUNITY_STATUSES (8), SOCIAL_PLATFORMS (10), LOCATION_RELATIONSHIPS (5), CONFIDENCE_LEVELS (4, unused), SOURCE_TYPES (7), CREATOR_STATUSES (4), CHANNEL_STATUSES (8), CHANNEL_IDEA_STATUSES (5), ENTITY_KINDS (10), plus labels. Four more vocabularies live only as inline lambdas in `src/lib/ingest/registry.ts` (format_org, channel_org, channel_person, opportunity_creator). `src/lib/hq/vocab.ts` holds twelve HQ lists. Column pickers and sort lists live in `creator-views.tsx` / `directory-controls.tsx`. Status branching on literals happens in ~25 places (development board, home, youtube, quiet timer, revive maps duplicated in `quick-edit.ts` and `ingest/apply.ts`, archive page). Tags (Entity) are the one vocabulary already in the database.

## 5. UI inconsistencies

- **Buttons**: no Button component; 105 `<button>`s use `.btn*`, 130 do not (mostly HQ), hover colour `#8a3a30` hard-coded ~10 times. Links styled as buttons.
- **Typeaheads**: eight independent debounced-fetch pickers (link-editor, directory-controls, upload-zone, hq/pickers ×2, creator-form, creator-views bulk, action-buttons) — only the command bar has full combobox ARIA.
- **Cards**: `.card` ×173 alongside ~40 hand-rolled `rounded-* border border-line` boxes.
- **Tables**: `RecordTable` (9 pages) vs `CreatorTable` vs three hand-rolled `<table>`s.
- **Overlays**: `overlay.tsx` gives Drawer/Modal with a proper focus trap, used in 6 files; `delete-record-button.tsx` hand-rolls an alertdialog without a portal or focus trap; **20 `window.confirm()` calls**.
- **Empty states**: `EmptyState` used on 3 pages; `RecordTable` has its own; ~50 bare `<p>` variants ("No X yet." / "None yet." / "Nothing here.").
- **Section headers**: `Section` on 19 pages, 77 hand-rolled `.overline` headings elsewhere; 14 distinct h1 class strings; three secondary-nav styles (admin chips, HQ pills, YouTube pills).
- **Status pills**: `StatusPill` (36-colour map) + `.kind-badge` + `.chip` + 4 inline copies.
- **Record pages** disagree on header layout, action order (six orders across seven pages), sidebar presence (people has none; youtube uses different grid units), section names for the same thing (Description/Overview/Brief/What it is; Notes/Internal Notes/Notes & Outcome), and which have Sources/Attachments.
- **Type scale**: `text-xs` 418 uses, `text-sm` 464, then `text-base/lg/xl/2xl/3xl/4xl/5xl` and arbitrary `text-[9px]`…`text-[15px]` — nine sizes in play. Body font-size unset (16px), tables 14px.
- **Loading**: no `loading.tsx`, no skeletons, one Suspense boundary.
- **Accessibility**: nine icon-only `×` buttons without a name (HQ), ~70 form controls without an explicit label, `.btn-sm` is 26px tall, `.chip` 22px, three different focus-ring offsets, live regions only on toasts and the directory count.

## 6. Dead code and leftovers

- No orphan files. Unused exports: `CONFIDENCE_LEVELS`, `rateFor`, `parseRepoId`, `MIRRORED`, `readAttachmentBytes`, `BACKUP_VERSION`, `orderForTalent`, `phaseItems`, `aiGate`, `parseIcsDate`, `dictionaryFor`, `isDigestible`, `extractCandidatePhrases`, `proposalOutputSchema`, `normalizeSubject`, `MAX_ARCHIVE_BYTES`, `MAX_CHILDREN`, `levenshtein`, `canonicalPlatform`, `SEARCH_SECTIONS` (now used), `deleteIngestItem`, `currentAirtableConfig`, `queueAirtableFor`. The per-type `resolve*` and Google `sync*` exports are reached internally.
- Dependencies: all used. `prisma` sits in `dependencies` (CLI only); `@types/bcryptjs` is redundant with bcryptjs 3's own types.
- `docs/ia-plan.md`, `docs/ingest-plan.md`, `docs/navigation-search-changelog.md` are planning artefacts nothing links to. `scripts/{rebuild-digests,harden-demo-users,remove-demo-data}.ts` and `demo-records.json` run on every deploy but are not in the README.
- The `uploads/` directory fallback in `/api/files/[name]`.
- No commented-out blocks, no TODOs.

## 7. Slow, broken or fragile

- Record pages with all-sequential awaits: opportunities/[slug], people/[slug], hq/pipeline/[id], hq/prep/[id], hq/people/[id]; talent/[slug] runs 9 awaits.
- N+1 loops in `drive-import.ts`, `actions/admin.ts` (CSV import), `bulk-upload.ts`, `merge.ts` (eight 3-query loops), `ingest/apply.ts`, `airtable/sync.ts`.
- 53 `as any`/`as never` casts (apply.ts 10, record-form.tsx 10, convert.ts 7) — every dynamic `db[model]` call.
- 55 silently swallowed errors (`convert.ts` alone has 19 `.catch(() => …)`).
- `Date.now()`/`new Date()` during render in 20 places (hydration-mismatch risk in the client ones).
- Search: alphabetical, no ranking; a misspelling finds nothing; aliases matched only as exact array elements.
- Hard delete exists on six record pages, contrary to the "archive only" rule.
- `SavedView` cannot be shared; column visibility for talent lives in `localStorage`.

## Ranked by impact on daily use

1. Finding things: no ranking, no fuzzy matching, palette without recents or actions, favorites/recents buried in a collapsed group.
2. Editing: every field change is a trip to a full-page form (talent has a drawer); no inline editing on record pages.
3. Options: every dropdown is a code change; no inline "create option".
4. Trust signals: verification only on talent; no owner on most types; no unverified marker.
5. Lists: no density, column control, selection or bulk actions outside talent; filters are per-page one-offs.
6. Coherence: eight typeaheads, 14 title styles, 20 confirm() dialogs, no loading states.
7. Codebase: casts, swallowed errors, duplicated vocab, hard delete.

## The plan

- **Phase 1 (no schema)** — sidebar in the brief's order with Favorites and Recent; cmdk palette (Recent / Actions / Navigation / results, ⌘↩ to peek); trigram + tiered ranking search with a real /search page; list views with density, column menu, selection + bulk bar, 50/page + view all; generic filters with operators and OR groups; URL state; per-user prefs in `AppSetting` (no migration needed); saved-view "unsaved changes"; side panel; breadcrumbs; Home dashboard.
- **Phase 2 (no schema for the most part)** — inline editing on every record page from the ingest registry's field definitions (one `setField` action with version check, audit, digest refresh, Airtable push); Details panel, tabs, footer metadata; relation pickers with inline create; C-key creation form; merge with two-column compare; bulk edit with batch ids; hard delete removed. Version on IndustryPerson and a `mergedInto` pointer are schema, so they go in the held migration.
- **Phase 3 (schema, held on the branch)** — `Option` table seeded from every list above, referenced by the slug already stored on records (deviation: slugs, not ids — see summary); inline "Create 'X'" in every select; Settings → Options; `FieldDefinition` + `custom` JSONB on each record with generated validation/rows/columns/filters/search; owner/verifiedAt/verifiedBy on every record; Health page; show-archived toggles; the domain fields from the brief as option sets and custom fields.
- **Phase 4 (no schema)** — semantic tokens + 12-step neutral scale + `color-scheme`; type scale down to four sizes; one Button/Input/Select/Combobox/Card/Table/Panel/Modal/Toast/Skeleton; empty/loading/error states; the keyboard map; mobile bottom tabs; focus rings, labels, targets, live region.
- **Phase 5** — ingest end-to-end check with the shared option pickers; dead exports and leftovers removed; casts and swallowed errors reduced; README.

## Progress log

Kept here between phases so the closing summary has the details; rewritten into the summary at the top when the pass ends.

### Phase 1 — shipped (bc47545)

Sidebar, palette, search, list views, filters, side panel, Home. Deviations: hand-rolled table kept (no TanStack), existing toast kept (no sonner), talent table kept as its own component (columns via prefs), extra sections (Industry people, YouTube, workspaces) kept in the rail, "Companies" label over the existing `/organizations` routes.

### Phase 2 — shipped

- **One write path for inline edits**: `setField` (src/lib/actions/inline.ts) over the ingest registry's field definitions — coercion per kind (`src/lib/record-fields.ts`), version check with "changed by [who]" conflict, audit row, digest refresh, Airtable queue. Renaming keeps the slug so links stay valid.
- **Record pages** (talent, projects, companies, formats, people, opportunities, YouTube channels) rebuilt on one layout: `RecordHeader` (editable name, type label, status, star, New note, Link, Verify, menu with Merge / History / Copy link / full form / Archive), resizable left `DetailsPanel` (width in prefs), tabbed main column (`Overview` with `Highlights` of up to six fields, one tab per relationship type as a `RelationTable`, `Activity` timeline), `RecordFooter` (created/updated/verified/owner/id). Archived records now render with a banner instead of a 404, so a merged record's page can still be read.
- **Editing behaviour**: Enter / ⌘Enter / Escape / Tab / blur, unchanged values skipped, optimistic with revert + Retry, Saved tick, Saving after 300 ms, Undo toast for 8 s, conflict → reload.
- **Quick create**: `C` / palette opens `CreateSheet` with the registry's create fields plus status; ⌘↩ and ⌘⇧↩; templates per type stored in prefs; an exact existing name is offered instead of a duplicate.
- **Merge** for the six main types: `/merge` picker (likely duplicates first) → two-column compare with a radio per field → `mergeRecordsCore` re-points every foreign key found in Prisma's model metadata (a duplicate link is dropped, a self-relationship removed), moves favorites / recents / collection items / sources / attachments / Airtable rows, copies picked values, aliases the loser's name, archives it with "Merged into …" and a pointer in `AppSetting` (`merged:<type>:<id>`). Likely duplicates flagged on the page via trigram similarity ≥ 0.55.
- **Bulk edit**: the floating bar gains "Set field…" for the type's select / text / number / date fields, still one audit row per record under a batch id, undoable as one.
- **Hard delete removed** (button, action) — Archive is the only way out.
- **Keys**: `E` edits the name, `N` new note, `L` opens the add box on the current tab, `C` create sheet.
- Deviations: the audit trigger table (`audit.record_version`) is schema and would duplicate `AuditLog`, which is already the single chokepoint every mutation passes through — kept `AuditLog` (Phase 3 revisits with the held migration). Long text stays plain text (the codebase renders `whitespace-pre-line`; docs use markdown separately); @mentions not built. The `mergedInto` column and `version` on IndustryPerson are schema → held for Phase 3; the pointer lives in `AppSetting` until then. Social profiles on talent are still edited on the full form (a sub-table, not a field). The full edit forms stay reachable from the menu as "Open the full form".

### Phase 3 — built, held on the branch

Held back from `main` deliberately: it carries
`prisma/migrations/20260915192543_refresh_options_fields_verification`, and
`scripts/vercel-build.mjs` runs `prisma migrate deploy` on every production
deploy, so merging it is what applies it. The brief's production-database rule
says to snapshot first; this sandbox cannot reach Neon, so it waits for a Neon
branch.

- **Migration** (additive only, with a working `down.sql`): new `Option` and
  `FieldDefinition` tables; `custom` JSONB, `verifiedAt`, `verifiedBy` and
  `mergedInto` on all seven record types; `ownerId` on talent, projects,
  companies and people; `version` on industry people. It seeds 245 option rows
  from the existing taxonomy using the **same values records already store**,
  26 field definitions for the brief's domain fields, and backfills
  `verifiedAt` from `lastVerifiedAt`, `ownerId` from each record's first
  `created` audit row and `mergedInto` from the `AppSetting` pointers Phase 2
  wrote. No existing value changes.
- **Options** are read through one isomorphic cache (`src/lib/option-cache.ts`)
  primed on the server and handed to the client, with the old taxonomy arrays
  as the fallback, so a cache miss degrades to today's behaviour rather than an
  empty select. Settings → Options renames, recolours, reorders, archives and
  merges; a merge reassigns every record that used the losing value and writes
  one audit row each. Renaming changes the label only.
- **Custom fields**: Settings → Fields defines a field on any record type
  (text, long text, number, date, checkbox, select, multi-select, URL, email,
  relation). The definition drives the Details row, the zod validation, the
  list column, the filter operators and the search text with no code change;
  marking one indexed creates a real expression index on its JSON path, and a
  dated one can be flagged to surface in Needs attention.
- **Verification and ownership**: Verify on every record page, an Unverified
  pill in the header and in search once past 90 days, owner and verifier in the
  footer, and Settings → Health listing unowned, unverified and near-empty
  records with bulk Verify and Set owner. The "near-empty" bucket derives its
  columns from Prisma's model metadata, so it cannot ask a non-nullable column
  for nulls.
- **Verified in a browser**: renaming an option propagates to the list and the
  filter picker; the merge dialog reports how many records carry the losing
  value; a field added under Settings → Fields appears in Details and edits
  inline; Verify stamps and clears the pill; a newly created option reaches the
  row picker, the filter picker, the Details select and the create sheet with
  no code change.
- Deviations: records still reference options by their stable slug rather than
  by option id (see the summary at the top); `AuditLog` remains the history,
  with no Postgres audit trigger; quick-create still shows only the essentials,
  so custom fields do not appear there yet.
- **A build break the preview deploys caught.** The Vercel build runs several
  scripts through `tsx` in plain Node, outside Next's module resolution. Phase 3
  made the digest rebuild reach the custom-fields module, which carried an
  `import "server-only"` — a guard Next resolves and Node cannot. Every preview
  build of this branch failed on it, and the production build would have failed
  the same way on merge. The guard came off the two modules in that path (the
  database import already keeps them off the client, as it does for the digest
  module beside them), and `tests/build-scripts.test.ts` now walks the import
  graph of every script the build runs and fails if any of them reaches a
  guarded module again. The whole build script was then run end to end against
  a database built from nothing by the migrations: clean.

### Phase 4 — shipped

- **Tokens**: `:root` carries a 12-step warm neutral scale, semantic names (background, foreground, muted, border, input, ring, primary, destructive) and four status colours with washes; the existing `@theme` names map onto them (`@theme inline`) so the thousand-odd existing utility classes did not have to change. `color-scheme: light` on the root (the app has one theme). `--color-faint` and `--color-muted` were darkened to clear 4.5:1 on white. Every hard-coded hex in components (29× `#8a3a30`, the status washes, the AI type badges) now uses a token.
- **Type**: body 14 px; four sizes in the UI (12 / 14 / 20 / 24) — `text-3xl/4xl/5xl` collapsed to `text-2xl`, `text-lg` to `text-xl`, `text-base`/`[15px]`/`[13px]` to `text-sm`, `[9–11px]` to `text-xs` (the Portrait monogram sizes are decorative and kept). Cards use a hairline border instead of a shadow; chips and small buttons meet the 24 px target.
- **One of each**: `Button` (label stays, spinner beside it, `aria-busy`), `Combobox` (ARIA combobox + listbox, arrows/Enter, "Create ‘X’" row) now behind the link popover, bulk tag picker, merge picker, upload "for" picker, talent bulk picker, talent form entity picker, filter picker lookups, collection picker and both HQ pickers; `ConfirmProvider`/`useConfirm` replaced every `window.confirm` (15); `EmptyState` gained a title and action and is used by the record table and relation tables; `Skeleton` with `ListSkeleton`/`RecordSkeleton` behind `loading.tsx` for the app and each record route, fading in after 200 ms; toasts capped at three; a global polite live region announces saves.
- **Keyboard**: `S` opens the status picker, `[` folds the Details column (remembered per person), `N` note, `L` link, `E` name; Escape order enforced (inline editor stops propagation, the panel ignores Escape while a dialog is open, a list clears its selection only when nothing is open above it).
- **Mobile**: bottom tab bar (Home / Talent / Projects / Formats / More), tables render as cards under `md`, the side panel is already full-width there, inputs are 16 px, the note button sits above the tab bar.
- **Archive**: "Show archived" toggle on every directory (talent, projects, companies, formats, people, opportunities, channels) with an Archived pill on rows; search already had one.
- Deviations: HQ's hand-rolled buttons keep their own classes (follow-up); no dark theme (none existed — tokens are ready for one); `.btn` classes remain the button system, `Button` wraps them rather than replacing every `<button>`.

### Phase 5 — shipped

- **Ingest checked first**: upload → parse → review board → apply all read the registry; the review form now offers the registry's vocabulary as a select for a proposed field (same options as every other picker), and a proposed new record is created through the same apply path as inline creation. The AI stages could not be exercised in the sandbox (no key, no network); they are covered by `tests/ingest.test.ts` with fakes and were working in production before this pass.
- **Dead code removed**: `CONFIDENCE_LEVELS`, `parseRepoId`, `orderForTalent`, `proposalOutputSchema`, `deleteIngestItem` (a hard delete), `currentAirtableConfig`, `queueAirtableFor`, the `uploads/` disk fallback in `/api/files`, the `StickyMiniHeader`, three planning docs (`docs/ia-plan.md`, `docs/ingest-plan.md`, `docs/navigation-search-changelog.md`), the redundant `@types/bcryptjs`.
- **Consolidated**: one typeahead (`Combobox`), one confirm, one empty state, one skeleton; the dynamic `db[model]` cast lives once in `src/lib/db-model.ts` (`modelFor`) — `as any` went from 87 to 45, the rest are form-value and JSON shapes; silently swallowed errors in `src/lib` now log where they happened (`ignore("context")`).
- **README** rewritten around what the app is, how it is structured, running it, migrations and the production database, and how options / custom fields / verification / history work now and after Phase 3.
- Left alone: the two undo paths that delete records their own import created (`bulk-upload` undo, ingest undo) — they undo an import, not a person's work, and are documented; `record-form.tsx`'s form-value casts; `prisma` in `dependencies` (the Vercel build needs the CLI).
