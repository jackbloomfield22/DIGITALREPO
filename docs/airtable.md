# Airtable mirror

Every format and project in the Repo has a row in the company Airtable base,
with its files. The Repo is the source of truth and pushes one way: edit a
page here (by hand, through the update panel, or by approving an upload) and
its row follows within seconds. Nothing typed into Airtable flows back.

## What a row holds

A deliberately small slice, enough for the team to find and recognise the
record: `Name` (or whatever the table's primary field is called), `Status`,
`Type`, `Logline`, `Companies`, `People` (name, role, company), `Talent`,
`Repo link`, `Repo ID`, `Files`, `Archived`, `Last moved`, `Sync note`.
Descriptions and internal notes stay in the Repo.

`Repo ID` is the key (`format:<id>` or `project:<id>`). A row that already
carries one is adopted rather than duplicated, so it is safe to point the
mirror at a base that was filled by an earlier run.

## Files

Every attachment on a format or project page is copied onto its row once and
remembered by Airtable's attachment id. Files up to 5 MB go by direct upload;
bigger ones are handed to Airtable as a signed link to the Repo that expires
within the hour (`/api/attachments/<id>/fetch`). Deleting a file on the page
takes it off the row. Files the team adds in Airtable are left alone.

A deck dropped into **Add Info** lands on the page it is for after review:
either the format or project chosen in "This file is for", or any format or
project the upload created. From there it goes to Airtable like any other
attachment. With Blob storage connected, Add Info uploads go straight from
the browser to storage, so decks are no longer limited to a few megabytes.

## Setting it up

1. In Airtable: Account → Developer hub → Personal access tokens → create one
   with `data.records:read`, `data.records:write`, `schema.bases:read` and
   `schema.bases:write`, and give it access to the base.
2. In Vercel: add `AIRTABLE_TOKEN` (the token) and, optionally,
   `AIRTABLE_BASE_ID`. Redeploy.
3. On the site: Admin → Airtable. Paste the base id if it isn't in Vercel,
   name the two tables (defaults `Formats` and `Projects`), then **Check
   connection**, **Set up tables & fields** (creates whatever is missing), and
   **Sync everything now** once to fill the base.

Without `schema.bases:write` the set-up button reports which fields to create
by hand; the names must match exactly.

## How pushes happen

- A change to a format or project (fields, status, archive, links, files,
  rename, move, deletion, the two-month quiet timer, an approved upload)
  queues a job; the job runs right after the request that caused it.
- `/api/cron/airtable` runs daily, re-queues every record and works through
  the queue. A hash of the last row sent is kept, so unchanged records cost no
  API call. Jobs that fail six times wait for **Retry** on the admin page.
- Airtable allows five requests a second per base; the client spaces calls
  and backs off for thirty seconds when told to.
- A record deleted from the Repo keeps its row, ticked `Archived` with a
  `Sync note` saying when it went.

Every page shows a small Airtable line under the title: the row link, when it
was last pushed, and **Sync now**.
