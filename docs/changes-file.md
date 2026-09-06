# Changes files

A changes file is a list of proposals written outside the site — by Claude in a
chat, from a page-by-page walk of the Repo — and dropped onto **Add Info**. It
lands on the normal review board already proposed: every change shows as
before → after, ticked by default, with one button to make them all and undo
afterwards. No model runs on the site, so it costs nothing per file.

## The workflow

1. **Once:** download a backup from Admin → Backups and hand it to Claude, so it
   knows what every page currently says. Backups leave out file bytes, so the
   file is small. Refresh it after a big batch of changes has been applied.
2. Go through the site and tell Claude, in any form and as many pages per
   message as you like, what is wrong and what is true. Screenshots are fine.
3. Claude replies with what it understood, page by page, and a `.json` changes
   file.
4. Drop the file on Add Info. Untick anything wrong, press apply. Undo is on the
   item afterwards.

## The format

```json
{
  "kind": "44forty-changes",
  "version": 1,
  "title": "Slate corrections, 6 Sep",
  "source": "The owner's own words, pasted whole. Evidence quotes highlight against this.",
  "changes": [
    { "op": "update", "targetType": "project", "targetName": "Grit City", "field": "status", "value": "cancelled",
      "confidence": 0.95, "rationale": "Netflix passed in March.", "evidence": ["netflix passed on grit city in march"], "sensitive": false },
    { "op": "rename", "targetType": "format", "targetName": "Untitled Golf Doc", "newName": "The Long Game",
      "confidence": 0.95, "rationale": "Working title replaced.", "evidence": ["the golf doc is called The Long Game now"], "sensitive": false },
    { "op": "convert", "targetType": "format", "targetName": "Open Water", "toType": "project", "fields": { "status": "airing" },
      "confidence": 0.9, "rationale": "It is a real production now.", "evidence": ["open water is airing, it's a project not a format"], "sensitive": false },
    { "op": "unlink", "kind": "creator_person", "aName": "Sam Rivers", "bName": "Alex Chen", "role": "agent",
      "confidence": 0.9, "rationale": "Alex no longer reps Sam.", "evidence": ["alex doesn't rep sam anymore"], "sensitive": false },
    { "op": "link", "kind": "project_org", "aName": "Grit City", "bName": "Netflix", "role": "streamer",
      "confidence": 0.9, "rationale": "Named as the buyer.", "evidence": ["it was set up at netflix"], "sensitive": false },
    { "op": "archive", "targetType": "format", "targetName": "Dead Idea", "reason": "Shelved; owner says drop it.",
      "confidence": 0.9, "rationale": "Owner said to drop it.", "evidence": ["drop dead idea"], "sensitive": false },
    { "op": "restore", "targetType": "format", "targetName": "Second Wind",
      "confidence": 0.9, "rationale": "Back in development.", "evidence": ["second wind is back on"], "sensitive": false },
    { "op": "note", "aboutType": "project", "aboutName": "Grit City", "text": "Buyer conversations restart in Q1.",
      "confidence": 0.8, "rationale": "No field for this.", "evidence": ["they'll go out again in q1"], "sensitive": false },
    { "op": "create", "targetType": "person", "name": "Jordan Lee", "fields": { "roleType": "agent", "title": "Agent, WME" },
      "confidence": 0.9, "rationale": "Not on record.", "evidence": ["jordan lee at wme reps her now"], "sensitive": false }
  ]
}
```

Each entry is one ingest op, exactly what the site's own reader produces. The
vocabulary — every op, every editable field per record type and its allowed
values, every link kind and its roles — comes from `describeOpVocabulary()` in
`src/lib/ingest/ops.ts`; run `npx tsx -e 'import {describeOpVocabulary} from
"./src/lib/ingest/ops"; console.log(describeOpVocabulary())'` to print it.

Rules the loader applies:

- Names resolve against the digest exactly (case-insensitive). A live record
  beats an archived one with the same name. A name with no match is kept for
  `create`, `link` and `note` (they can create) and fails at apply for
  `rename`, `restore`, `convert` and `unlink` (they never create).
- An `update` whose value already matches the page is dropped silently.
- A `link` that already exists is dropped; an `unlink` of a connection that
  isn't there is dropped.
- Entries that don't parse are counted and left out; the count shows in the
  toast and on the item.
- Up to 500 changes per file. Split larger batches.
- Re-running "propose" on a loaded file does nothing: its proposals are fixed.
  Load a new file to change them.
