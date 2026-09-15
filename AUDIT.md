# 4.4.Forty Repo — audit and refresh plan

_Phase 0 of the cleanup, UI and usability pass. Written 2026-09-15 before any code changed. The summary of what was done goes at the top of this file when the pass finishes._

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

### Phase 4 — shipped

- **Tokens**: `:root` carries a 12-step warm neutral scale, semantic names (background, foreground, muted, border, input, ring, primary, destructive) and four status colours with washes; the existing `@theme` names map onto them (`@theme inline`) so the thousand-odd existing utility classes did not have to change. `color-scheme: light` on the root (the app has one theme). `--color-faint` and `--color-muted` were darkened to clear 4.5:1 on white. Every hard-coded hex in components (29× `#8a3a30`, the status washes, the AI type badges) now uses a token.
- **Type**: body 14 px; four sizes in the UI (12 / 14 / 20 / 24) — `text-3xl/4xl/5xl` collapsed to `text-2xl`, `text-lg` to `text-xl`, `text-base`/`[15px]`/`[13px]` to `text-sm`, `[9–11px]` to `text-xs` (the Portrait monogram sizes are decorative and kept). Cards use a hairline border instead of a shadow; chips and small buttons meet the 24 px target.
- **One of each**: `Button` (label stays, spinner beside it, `aria-busy`), `Combobox` (ARIA combobox + listbox, arrows/Enter, "Create ‘X’" row) now behind the link popover, bulk tag picker, merge picker, upload "for" picker, talent bulk picker, talent form entity picker, filter picker lookups, collection picker and both HQ pickers; `ConfirmProvider`/`useConfirm` replaced every `window.confirm` (15); `EmptyState` gained a title and action and is used by the record table and relation tables; `Skeleton` with `ListSkeleton`/`RecordSkeleton` behind `loading.tsx` for the app and each record route, fading in after 200 ms; toasts capped at three; a global polite live region announces saves.
- **Keyboard**: `S` opens the status picker, `[` folds the Details column (remembered per person), `N` note, `L` link, `E` name; Escape order enforced (inline editor stops propagation, the panel ignores Escape while a dialog is open, a list clears its selection only when nothing is open above it).
- **Mobile**: bottom tab bar (Home / Talent / Projects / Formats / More), tables render as cards under `md`, the side panel is already full-width there, inputs are 16 px, the note button sits above the tab bar.
- **Archive**: "Show archived" toggle on every directory (talent, projects, companies, formats, people, opportunities, channels) with an Archived pill on rows; search already had one.
- Deviations: HQ's hand-rolled buttons keep their own classes (follow-up); no dark theme (none existed — tokens are ready for one); `.btn` classes remain the button system, `Button` wraps them rather than replacing every `<button>`.
