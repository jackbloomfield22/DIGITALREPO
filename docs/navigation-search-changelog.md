# Navigation and search update — September 2026

Based on commit `4086d7442d47896f26092672603e6e060a0bb992`.

## Search

- Added `/search` with counts by section, section filters, pagination, and optional archived records.
- Searches live records and direct relationships: talent, formats, projects, organizations, industry people, opportunities, YouTube channels, interests/topics, collections, and the development slate/YouTube playbook.
- Shared directory search now matches descriptive text and connected records, not just names.
- Quick search includes page shortcuts, keyboard selection, loading/error states, and a full-results link. Private HQ data stays outside shared search.

## Filters and navigation

- Replaced nested directory filter menus with visible labeled controls.
- Standardized Talent, Formats, Projects, Organizations, People, Opportunities, and YouTube Channels controls.
- Added removable search/filter chips, clearer result counts, empty-result guidance, and a save-view dialog.
- Clearing filters preserves sort and display mode; saved views are accessible through Collections.
- Reorganized sidebar into collapsible groups; added breadcrumbs and a link back to the exact previous directory URL.
- Improved mobile menu, dialog focus containment/restoration, keyboard focus cues, table spacing, and numbered pagination.

## Correctness fixes

- Search input follows Back navigation and clearing filters.
- Pending search debounce no longer overwrites later filter changes or newer typing.
- Talent uses a consistent default list view.
- Total-audience filters preserve Recently Added/Updated and project/format-count sorting.
- Recently Updated sort choices use descending order.
- YouTube channel controls stay on the channel directory; pipeline honors search, status, and sort.
- Digital preserves sorting when changing platforms; its All Talent audience link uses the supported sort value.
- Pagination rejects non-finite/fractional values; main directories redirect oversized pages with filters intact.
- Follower thresholds reject invalid values.
- Recently-viewed server action verifies the session user matches the supplied user ID.
- Saved-view inputs now validate supported destinations and lengths.

## Main implementation files

- `src/lib/repo-search.ts`, `src/lib/search-where.ts`: shared search queries.
- `src/lib/navigation.ts`: navigation definitions and permission filtering.
- `src/lib/directory-params.ts`: URL validation and filter helpers.
- `src/components/hooks/use-directory-query.ts`: shared search/filter navigation state.
- `src/components/directory-controls.tsx`: common directory interface.
- `src/components/page-trail.tsx`: breadcrumbs and return to filtered results.
- `src/app/(app)/search/page.tsx`: full search page.

## Validation

- TypeScript check: passed.
- ESLint: passed.
- Navigation/filter regression tests: 20 passed.
- Full suite on an isolated, seeded PGlite database: 161 passed, 1 failed.
- Remaining failure: the existing conversion-reversal test in `tests/page-edit-ops.test.ts` cannot find the restored favorite; the test log reports a closed database connection during `revertConversion`. Neither that test nor `src/lib/convert.ts` was changed. This run does not establish whether the cause is PGlite compatibility or a product defect; verify on standard PostgreSQL.
- No browser/visual testing was performed.
- `happy-dom` was added as a development dependency for URL-state interaction tests.
- No production database migration or data rewrite is introduced by this change.
