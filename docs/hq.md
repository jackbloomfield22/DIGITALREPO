# HQ

HQ is one person's private operating system inside the Repo: `/hq`, visible and
usable only by the owner (`HQ_OWNER_EMAIL`, default `jackbloomfield22@gmail.com`).
For anyone else the section does not exist — the sidebar has no entry and every
HQ page, action and API answers 404. HQ data lives in its own tables
(`Hq*`), every row carries `ownerId`, and those tables are left out of the shared
backups on purpose; HQ has its own export on its Settings page.

## What it is

One section with eight views of the same thing, not eight tools.

- **Today** — what matters, computed: overdue and due follow-ups, meetings to
  prep for (any event linked to a person or a card), pipeline cards whose next
  step is late or missing or whose contact has gone quiet, people going cold by
  circle, and three ideas resurfaced from the archive. Every line says why it is
  there. `src/lib/hq/brief.ts` is the scorer, pure and tested.
- **The capture bar** — on every HQ page. One line in, filed as a task, follow-up,
  event, idea or note. `call Alex tomorrow` → follow-up with Alex due tomorrow;
  `idea: …` → idea; `lunch w/ Sam Rivers thu 1pm #open-water` → event with Sam,
  linked to the Open Water card. `@Name` links a person, `#ref` links a card, a
  blank line starts the notes. It shows how it read the line so a wrong guess is
  obvious. `src/lib/hq/capture.ts`.
- **Pipeline** — a development CRM: cards by stage (idea → developing → talent
  attached → packaging → buyer conversations → in negotiation → sold / in
  production / parked / passed), dragged between columns. A card holds what the
  Repo record does not: why it matters, the single next step and its date, heat,
  last contact, notes, and the people on it with roles (decision maker,
  champion, talent, rep, partner). Cards sit on top of Repo records where one
  exists and link back.
- **People** — relationship intelligence: every person is a Repo person or talent
  with a private layer — circle (inner/active/warm/cold), touch cadence,
  interests, how you met, potential opportunities, notes — and a log of
  conversations. Logging a conversation moves last-contact and can create a
  follow-up; finishing a follow-up logs contact. Gmail sync (when connected)
  does the same automatically for anyone with an email on file.
- **Brain** — search over notes, ideas, conversations, cards, people, style
  examples and the whole Repo at once, with the question read for the kind of
  answer wanted: "what athletes have we discussed for prank formats" returns the
  formats that mention pranks *and the talent attached to them*. Postgres
  full-text with expression indexes; no model call. `src/lib/hq/search.ts`.
- **Ideas** — the archive for future you: ideas, format mechanics, titles,
  talent pairings, rabbit holes, with a rating, a status and tags. Anything can
  be promoted to a pipeline card. Today resurfaces three a day, oldest-untouched
  first, rotated by date.
- **Studio** — the pitch assistant: an editable style guide, an examples library
  (paste, or upload a deck/doc and it is read to text), and a brief builder
  that turns the style guide + best-fit examples + everything HQ and the Repo
  know about a project or person into one block of text. Paste it to Claude
  (free) or, with AI on, draft on the site.
- **Calendar** — in-app events (linked to people and cards), `.ics` import, and
  the Google sync.
- **Settings** — seed from the Repo, import a brain bundle, export HQ, the AI
  switch and daily cap with a spend meter, and the Google connection.

## Seeding

**Seed from the Repo** creates a pipeline card for every live format, channel,
production and opportunity at the matching stage (with its talent and people
attached) and a relationship for every industry person and talent. Idempotent:
it only creates what is missing and never touches a row the owner has edited.
Seeded rows carry `source: "seed"` and the Today page does not nag them for a
missing next step or contact until they have been edited — an edit flips the
source to `manual`.

**Brain bundle** (`kind: "44forty-brain"`) brings in material prepared outside
the site — ideas mined from old notes, people with interests and history, cards,
tasks. Names resolve against HQ's people, then the Repo (creating the
relationship), and unresolved names are reported rather than guessed.

```json
{ "kind": "44forty-brain",
  "ideas": [{ "title": "…", "body": "…", "kind": "format_mechanic", "rating": 4, "tags": ["golf"] }],
  "notes": [{ "title": "…", "body": "…", "kind": "meeting", "about": "Dana Whitfield" }],
  "relationships": [{ "name": "Dana Whitfield", "tier": "active", "interests": ["golf"], "notes": "…", "opportunities": "…", "email": "…", "lastContactAt": "2026-08-01" }],
  "interactions": [{ "name": "Dana Whitfield", "at": "2026-08-01", "kind": "meeting", "summary": "…" }],
  "pipeline": [{ "title": "Grit City", "stage": "buyer_conversations", "heat": 3, "whyItMatters": "…", "nextStep": "…", "nextStepDue": "2026-09-15" }],
  "tasks": [{ "title": "…", "dueAt": "2026-09-10", "person": "Dana Whitfield" }] }
```

## Google Calendar and Gmail

Built and dormant until `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.
Setup (about ten minutes): Google Cloud Console → new project → enable the
Calendar API and Gmail API → OAuth consent screen (external, add your address as
a test user) → OAuth client (web application) with the redirect URI
`https://<site>/api/hq/google/callback` → put the two values in Vercel → redeploy
→ HQ Settings → Connect Google. Read-only scopes only.

Sync pulls the primary calendar (a week back, 45 days ahead) into events, and
reads Gmail *metadata* for the last 30 days (then since the last sync): a message
to or from anyone in People with an email on file becomes a conversation on that
person (subject line only) and moves their last-contact date. Nothing is stored
about mail with anyone else. Disconnecting revokes the token and removes synced
events. Tokens are held on `HqConnection`; the whole table is owner-only.

## AI

Off by default. When switched on (and `ANTHROPIC_API_KEY` is set) two things
use the model: **Ask the brain** on the Brain page — a question over the live
notes, people, pipeline and Repo, which a chat outside the site cannot see — and
**Draft here** in the Studio. Both pass one gate (`src/lib/hq/ask.ts`): the
switch, and a daily cap in cents. Every call is recorded with token counts and an
estimated cost (`AI_ASK_INPUT_CENTS_PER_M`, `AI_ASK_OUTPUT_CENTS_PER_M`;
model `AI_MODEL_ASK`, default `claude-sonnet-5`), and the meter is on Settings.
Everything else in HQ works without a model.

## Files

- `src/lib/hq/owner.ts` — the guard. `src/lib/hq/vocab.ts` — stages, tiers, kinds.
- `src/lib/hq/capture.ts`, `brief.ts`, `search.ts`, `ics.ts` — pure logic, tested in `tests/hq.test.ts`.
- `src/lib/hq/google.ts` — OAuth and sync. `src/lib/hq/seed.ts` — seed, export, bundle import. `src/lib/hq/ask.ts` — the gated model calls. `src/lib/hq/studio.ts` — the brief builder.
- `src/lib/actions/hq.ts` — every write. `src/app/api/hq/*` — lookup, export, ask, draft, brief, style-upload, Google start/callback.
- `src/app/(app)/hq/*` — the pages. `src/components/hq/*` — the views.
