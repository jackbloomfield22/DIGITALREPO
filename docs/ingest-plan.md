# Ingest System — Implementation Plan

Replaces the Research Inbox with a staged, reviewable pipeline for feeding the
4.4.Forty Repo documents, files, and emails. This file records the decisions,
including where the implementation deliberately deviates from the original brief.

## Schema changes

- **KnowledgeDigest** — one compact plain-text dossier row per canonical record
  (creator, project, organization, format, person, opportunity, entity, event).
  Unique `(targetType, targetId)`. Migration adds, in raw SQL: `pg_trgm`
  extension, a generated `tsvector` column over `searchText` with a GIN index,
  and trigram indexes on `name` and `searchText`. The tsvector column lives only
  in the database (queried via `$queryRaw`), not in the Prisma model, because
  Prisma cannot represent generated columns cleanly.
- **IngestItem** — one row per uploaded file / pasted text / unpacked child.
  Raw bytes retained in Postgres up to `INGEST_RAW_CAP_MB` (default 4);
  larger files keep extracted text only. Statuses:
  `uploaded → parsed → triaged|irrelevant → proposed → applied`, plus `failed`.
- **IngestChange** — one row per proposed change with destination, op payload,
  before/after, confidence, rationale, verbatim evidence + offsets, `sensitive`,
  review status (`pending|approved|edited|rejected|applied|failed|superseded`).
- **archivedReason / archivedAt** on Creator, Project, Organization, Format,
  Opportunity, IndustryPerson.
- **ResearchInboxItem** is migrated into IngestItem and dropped. Old pending
  and proposed rows become `parsed` text items (old proposals are not converted
  — the shape changed; re-proposing costs one cheap call and produces better
  output). Applied/dismissed rows carry over as `applied`/`irrelevant` history.
  `/inbox` permanently redirects to `/ingest`.

## Pipeline stages (each short, independently invocable, idempotent)

1. **Upload** `POST /api/ingest/upload` (EDITOR) — multi-file + pasted text;
   creates `uploaded` items; no parsing in-request.
2. **Parse** `POST /api/ingest/run` `{id, stage:"parse"}` — deterministic, no AI.
3. **Triage** — deterministic candidate matching against KnowledgeDigest
   (trigram + full-text, in-memory fallback), then one cheap-model call
   (`AI_MODEL_TRIAGE`, default Haiku) with structured output.
4. **Propose** — primary model (`AI_MODEL`), chunked with overlap, structured
   output validated against the registry-derived op schema; mechanical
   cross-chunk dedupe (same destination + same after ⇒ merged).
5. **Review** — `/ingest` UI.
6. **Apply** — approved/edited changes in dependency order through the existing
   resolve helpers + link engine, with version-conflict handling
   (`superseded` + refreshed `before`), Source attribution, audit entries
   (`field: "ingest"` + item id), digest refresh.

**Deviation — stages are route handlers, not server actions.** `maxDuration`
is a route-segment export; a single `/api/ingest/run` route (with
`maxDuration = 60`, the Hobby-plan ceiling) hosting all stages guarantees the
limit actually applies, gives the cron and the client-side bulk runner the same
entry point, and keeps stage logic in `src/lib/ingest/pipeline.ts` behind it.

## Parser choices (deviation from suggested libraries)

- **Email**: `postal-mime` — pure JS, zero Node-only deps, runs in any runtime;
  `mailparser` drags in a large stream-based dependency tree sized for mail
  servers. `.mbox` split by `From `-line framing (hand-rolled, ~30 lines) with
  child/byte caps. `.msg` (Outlook binary) is accepted and stored but marked
  `failed` with a "convert to .eml" message — a CFBF parser is a heavy
  dependency for a marginal format.
- **PDF**: `unpdf` — pdf.js packaged for serverless, maintained, no filesystem
  or worker assumptions (`pdf-parse` is unmaintained and breaks on newer PDFs).
- **docx / pptx / xlsx / zip**: one tiny dependency, `fflate`, plus ~80 lines of
  XML text extraction. All three formats are zip archives of XML; we need text,
  not layout, so `mammoth`/`sheetjs`/pptx libraries would add megabytes of
  dependency for no extra extraction quality here. Spreadsheets extract shared
  strings + inline cell text; pptx extracts `a:t` runs per slide; docx extracts
  `w:t` runs per paragraph.
- Quoted replies / signatures / disclaimers stripped with conservative
  heuristics (`On … wrote:`, `>` blocks, `-- ` sig marker, common disclaimer
  phrases); the stripped remainder is kept in `metadata.strippedText`.

## Registry (`src/lib/ingest/registry.ts`)

Single source for what ingest may read and write. Per record type: editable
fields (type, max length, vocabulary source in `taxonomy.ts`), participating
link kinds (derived from the exported `linkPayloadSchema` in `links.ts` via a
`LINK_SPEC` table — a coverage test fails if a link kind has no spec), the
digest recipe (loader + formatter), destination path template and URL builder.
The model-facing op schema, zod validation of model output, digest generator,
and review-UI grouping all derive from it. Coverage tests: every Prisma model
with an `archived` column has a registry entry; every link kind has a spec.

## Knowledge Digest freshness

`refreshDigest(targetType, targetId)` is called from `logAudit` /
`logFieldChanges` (the chokepoint every mutation already passes through) and
from `addLink`/`removeLink` for the far side of the link.
**Deviation — debounce is a 2-second in-memory TTL memo** rather than
request-scoped batching: serverless actions have no shared request context to
hang a batch on, the memo collapses the common burst (one apply touching a
record repeatedly on a warm instance), and a redundant refresh costs a few
milliseconds. Full rebuild: `scripts/rebuild-digests.mjs`, an Admin → Ingest
button, and a conditional rebuild in `scripts/vercel-build.mjs` when the table
is empty. Backups include the digest table (restore simply restores it — it is
also rebuildable at any time).

## AI calls

- Triage: `AI_MODEL_TRIAGE` (default `claude-haiku-4-5`), forced tool choice
  (no thinking on Haiku ⇒ forced tools are safe).
- Propose: `AI_MODEL` (default `claude-opus-5`). **Deviation:** Opus 5 runs
  adaptive thinking by default, and thinking is incompatible with forced tool
  choice — so propose uses `tool_choice: auto` with an instruction to always
  call the tool, and retries once with a reminder if no tool call comes back.
  This keeps thinking (better extraction) and still yields structured output.
- Prompt caching: stable system prompt + registry-derived op schema first with
  `cache_control`, document text last. Only matched digest rows are sent,
  capped by count and characters. Irrelevant items never reach propose.
  Thread context = compact list of already-applied changes from earlier items.
- Token usage recorded per stage on the item; totals on the queue and
  Admin → Ingest.
- Tests inject a fake model runner (the pipeline takes the runner as a
  parameter) instead of monkey-patching the SDK.

## Cron & bulk

Client-side runner advances one item/stage at a time with progress + stop.
`/api/cron/ingest` (CRON_SECRET-guarded like the backup cron) advances items
stuck in `uploaded`/`parsed`. **Note:** Vercel Hobby crons are daily — the
cron is a safety net; the in-browser runner is the primary driver.

## Archive

`/archive` lists archived records of all types with reason, source ingest item,
who/when, and Restore (existing restore path + audit). Archived records stay out
of directories and search; the digest matcher includes them at low weight so
the model can propose restoring instead of duplicating.

## Phase order

1. Registry + KnowledgeDigest + hooks + rebuild + tests.
2. IngestItem/IngestChange schema + inbox migration + upload + parsers.
3. Candidate matching + triage + propose + token logging.
4. Review UI + apply engine + conflicts + Sources.
5. Archive section + reasons.
6. Cron + bulk runner + Admin → Ingest + README.

One commit per phase; `typecheck`, `lint`, `test` before each.

## Post-launch additions (Aug 2026)

- **Robust model-output validation**: free-text from the model is clamped to caps
  instead of failing the item; proposals parse per-op (malformed ops dropped and
  counted); failed items are retryable from the right stage via a Retry button.
- **Uploader context**: optional note on upload ("what this is / why it matters"),
  stored on IngestItem.context, inherited by children, fed to triage and propose
  as trusted context, and shown on the review screen.
- **Internet research toggle**: per-upload opt-in (IngestItem.webResearch). When on,
  propose runs with Anthropic's server-side web_search tool (web_search_20260209,
  max 3 searches/call, pause_turn continuation in the runner). Prompt rules require
  web-sourced facts to name their source in the rationale and cap confidence at 0.6.
- Propose covers up to INGEST_MAX_CHUNKS chunks (default 5, ~116k chars).
