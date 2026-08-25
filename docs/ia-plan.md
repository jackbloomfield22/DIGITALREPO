# Information Architecture — 4.4.Forty Repo (Aug 2026 restructure)

The Repo is the company's institutional brain, not a set of database tables.
The nav communicates hierarchy: pillars first, research modes second, personal
utilities third, operations fourth, system last.

## Navigation

- **Home** — `/` (real command-center homepage; no more redirect to /talent)
- **The Repo**
  - Talent — `/talent`
  - Development — `/development` (landing) → Formats `/formats`, Opportunities `/opportunities` (indented children)
  - Projects — `/projects`
  - Industry — `/industry` (landing) → Organizations `/organizations`, People `/people` (indented children)
  - Calendar — `/calendar`
- **Research** — Explore `/explore`, AI Search `/ai`, Ingest `/ingest`
- **My Repo** — Collections, Favorites, Recent
- **Operations** — Needs Attention, Activity, Archive
- Bottom rail: Search ⌘K, Admin (admins only), Settings, user/sign-out.

Deliberate calls:
- **No `/research` landing page.** Explore, AI Search, and Ingest are each
  strong destinations; the labelled sidebar group is the orientation. A landing
  page would be a shell.
- **Development and Industry get landings** because they add cross-section
  intelligence a directory can't: the development slate as a pipeline, and the
  relationship layer summarized.
- All existing URLs keep working. Nothing moves; the nav reorganizes around it.
- `/people/new` added (people previously could only be created inline).

## Page patterns

- Directories, detail pages, and edit flows are untouched — they already share
  a coherent pattern (DirectoryControls, Section, LinkChips, card grid).
- New pages reuse the same tokens: `overline` group labels, `card`,
  `kind-badge`, `Section`, editorial type.

## Home modules (compact, two-column)

Continue Working (user's recent views) · Active Development (formats in motion
+ deadlines) · Upcoming (sports calendar) · Needs Attention (shared counts from
`src/lib/attention.ts`) · Team Activity (compact) · Pinned (favorites +
collections) · Quick create for editors · prominent ⌘K search.

## Shared logic

`src/lib/attention.ts` centralizes the Needs Attention where-clauses so the
homepage summary and the `/attention` workflow page can never disagree.
