// Triage + propose stages. Each is short, independently invocable, and
// idempotent; the model runner is injected so tests never touch the API.

import { db } from "@/lib/db";
import {
  PROPOSE_MODEL,
  TRIAGE_MODEL,
  anthropicRunner,
  ingestAiAvailable,
  type ModelRunner,
  type ModelUsage,
} from "@/lib/ingest/ai";
import { matchCandidates, type DigestCandidate } from "@/lib/ingest/matching";
import {
  describeOpVocabulary,
  proposalToolSchema,
  proposedOpSchema,
  triageOutputSchema,
  triageToolSchema,
  validateOp,
  type ProposedOp,
} from "@/lib/ingest/ops";
import { LINK_SPECS, RECORD_REGISTRY, type IngestTargetType } from "@/lib/ingest/registry";

export type StageResult = { ok: boolean; error?: string; status?: string };

const TRIAGE_TEXT_CAP = 18_000;
const CHUNK_SIZE = 24_000;
const CHUNK_OVERLAP = 2_000;
// Long pasted threads are the main input, so cover more of them by default.
// Still bounded to stay inside the serverless function limit; anything beyond
// is noted on the item. Tune with INGEST_MAX_CHUNKS.
const MAX_CHUNKS = Number(process.env.INGEST_MAX_CHUNKS) > 0 ? Number(process.env.INGEST_MAX_CHUNKS) : 5;

async function recordUsage(itemId: string, stage: string, usage: ModelUsage) {
  const item = await db.ingestItem.findUnique({ where: { id: itemId }, select: { tokenUsage: true } });
  const current = (item?.tokenUsage as Record<string, { model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; calls: number }> | null) ?? {};
  const prev = current[stage] ?? { model: usage.model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, calls: 0 };
  current[stage] = {
    model: usage.model,
    inputTokens: prev.inputTokens + usage.inputTokens,
    outputTokens: prev.outputTokens + usage.outputTokens,
    cacheReadTokens: prev.cacheReadTokens + usage.cacheReadTokens,
    calls: prev.calls + 1,
  };
  await db.ingestItem.update({ where: { id: itemId }, data: { tokenUsage: current } });
}

function describeSource(item: { kind: string; filename: string | null; metadata: unknown }): string {
  if (item.kind === "email") {
    const m = (item.metadata ?? {}) as { from?: string; to?: string[]; date?: string; subject?: string };
    return `EMAIL\nFrom: ${m.from ?? "?"}\nTo: ${(m.to ?? []).join(", ")}\nDate: ${m.date ?? "?"}\nSubject: ${m.subject ?? "?"}`;
  }
  return `${item.kind.toUpperCase()}${item.filename ? `: ${item.filename}` : ""}`;
}

// Shown only when the uploader flipped the Internet research toggle on.
const WEB_RESEARCH_RULES = [
  "INTERNET RESEARCH IS ENABLED for this document. You may use the web_search tool to fill",
  "gaps: when the document references a person, company, project, or deal but omits details",
  "worth recording (full name, company, role, platform, dates), search to complete them.",
  "Rules:",
  "- Search only for things the document itself references — never add unrelated facts.",
  "- Facts that come from the web rather than the document: cap confidence at 0.6, and",
  "  name the source (publication/site and date) at the start of the rationale, e.g.",
  '  "Web: Variety, Aug 2026 — ...". Quote the document for evidence where possible;',
  "  otherwise quote the search result.",
  "- Prefer the document over the web when they disagree; note the disagreement.",
  "- At most a few targeted searches — this is gap-filling, not open-ended research.",
].join("\n");

// Shown when the uploader said this is channels-business material. The whole
// point of the switch: the same page of names is a slate of documentaries or a
// list of channels to chase, and nothing in the text itself says which.
const YOUTUBE_RULES = [
  "THIS WHOLE DOCUMENT IS FOR THE ATHLETE YOUTUBE CHANNELS BUSINESS. Read all of it that way,",
  "including passages that would be ambiguous on their own.",
  "- An athlete named as someone we want to work with on YouTube is a `channel` record,",
  "  not a talent-only note and not a format. Its name is the athlete's name unless the",
  "  document gives the channel one.",
  "- Bullets under an athlete — a doc series, a podcast, a drill, 'content with the dogs' —",
  "  are things that channel could make. Put them in the channel's `ideas` field, one per",
  "  line; they become the channel's idea queue. Do not invent a Format for each one.",
  "- A channel's status is where it stands with us: prospect (we'd like to), in_talks,",
  "  signed, building, live, paused, ended. 'Hopefully meeting with him next week' is",
  "  in_talks; 'channels we'd like to work on' is prospect.",
  "- Subscriber counts, view counts and upload cadence belong on the channel.",
  "- Companies attached to a channel (production partner, management, MCN, brand) are",
  "  channel_org links; people to call about it are channel_person links.",
  "- Only make a Format when the document describes a show being developed and sold as a",
  "  show. A channel is where a run of them lives; the two are not the same record.",
].join("\n");

function workspaceRules(item: { workspace: string | null }): string {
  return item.workspace === "youtube" ? YOUTUBE_RULES : "";
}

function uploaderContext(item: { context: string | null }): string {
  return item.context
    ? `NOTE FROM THE UPLOADER (what this is and why it matters — trust it when judging relevance and deciding what to extract):\n${item.context}`
    : "";
}

function candidateBlock(candidates: DigestCandidate[]): string {
  if (!candidates.length) return "No existing records matched this document.";
  return [
    "EXISTING RECORDS THAT LIKELY RELATE (from the knowledge index — id in brackets):",
    ...candidates.map((c) => `[${c.id}]${c.archived ? " (ARCHIVED)" : ""}\n${c.summary}`),
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

const TRIAGE_SYSTEM = `You triage documents for an entertainment-industry knowledge base covering talent (creators, athletes, hosts...), their projects, formats in development, organizations (brands, production companies, networks, agencies), industry people (agents, managers, executives), and opportunities.

A document is RELEVANT if it states facts worth recording: who is attached to what, new projects or deals, representation changes, brand relationships, interests, statuses, company facts.
A document is IRRELEVANT if it is pure logistics (scheduling, thanks, confirmations), automated notifications, newsletters, marketing blasts, or contains no facts about people/companies/projects.

Judge only from the text given. Always respond by calling the submit_triage tool.`;

export async function triageItemCore(
  itemId: string,
  runner: ModelRunner = anthropicRunner,
): Promise<StageResult> {
  const item = await db.ingestItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: "Item not found." };
  if (!["parsed", "triaged", "irrelevant", "failed"].includes(item.status)) {
    return item.status === "proposed" || item.status === "applied"
      ? { ok: true, status: item.status }
      : { ok: false, error: `Cannot triage an item in status "${item.status}".` };
  }
  if (runner === anthropicRunner && !ingestAiAvailable()) {
    return { ok: false, error: "AI triage needs ANTHROPIC_API_KEY. The document is parsed and stored — configure a key to generate proposals." };
  }
  const text = (item.extractedText ?? "").trim();
  if (item.status === "failed" && !text) {
    return { ok: false, error: "This item failed before any text was extracted — run the parse stage again." };
  }
  if (!text) {
    await db.ingestItem.update({
      where: { id: itemId },
      data: { status: "irrelevant", relevance: { score: 0, reasons: ["No text content"] } },
    });
    return { ok: true, status: "irrelevant" };
  }

  try {
    const candidates = await matchCandidates(text);
    const { output, usage } = await runner({
      model: TRIAGE_MODEL,
      maxTokens: 2000,
      systemStable: TRIAGE_SYSTEM,
      userContent: [
        candidateBlock(candidates),
        "",
        workspaceRules(item),
        uploaderContext(item),
        describeSource(item),
        "",
        "DOCUMENT TEXT:",
        text.slice(0, TRIAGE_TEXT_CAP),
      ].filter(Boolean).join("\n"),
      toolName: "submit_triage",
      toolDescription: "Submit the triage verdict for this document.",
      toolSchema: triageToolSchema(),
      forceTool: true,
    });
    await recordUsage(itemId, "triage", usage);
    const verdict = triageOutputSchema.parse(output);

    // The uploader's own switch always wins. Only fill the lane in when they
    // did not set one — a stated intent is worth more than a read of the text,
    // and silently overruling it would make the switch untrustworthy.
    const inferredWorkspace =
      item.workspace === null && verdict.workspace === "youtube" ? "youtube" : undefined;

    await db.ingestItem.update({
      where: { id: itemId },
      data: {
        status: verdict.relevant ? "triaged" : "irrelevant",
        error: null,
        ...(inferredWorkspace ? { workspace: inferredWorkspace } : {}),
        relevance: {
          score: verdict.score,
          reasons: verdict.reasons,
          candidateRecords: verdict.candidateRecords,
          newRecordCandidates: verdict.newRecordCandidates,
          sections: verdict.sections,
          // Recorded so the review screen can say the section was worked out
          // rather than chosen, which is the difference between a reader
          // trusting it and wondering where it came from.
          workspaceInferred: !!inferredWorkspace,
          matchedDigestIds: candidates.map((c) => c.id),
        },
      },
    });
    return { ok: true, status: verdict.relevant ? "triaged" : "irrelevant" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Triage failed.";
    await db.ingestItem.update({ where: { id: itemId }, data: { status: "failed", error: message } });
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Propose
// ---------------------------------------------------------------------------

function proposeSystem(): string {
  return `You extract database changes from entertainment-industry documents for the 4.4.Forty Repo, an internal knowledge base. You produce PROPOSALS a human reviews — you never write to the database.

RULES:
- Only facts stated in the source. Never embellish, never infer beyond the text. Every change carries verbatim evidence copied exactly from the source.
- Prefer editing an existing record over creating a new one: when a record in the knowledge index matches, use its id in targetId/aId/bId and explain the match in the rationale.
- "Formats" are internal 4.4.Forty concepts in development; "Projects" are real existing productions. Never confuse them.
- "Channels" are the athlete YouTube channels business: an ongoing channel 4.4.Forty builds and runs for a person, as opposed to one show. Use a channel record whenever the source is about a person's channel rather than about a single title — a named YouTube channel or handle, subscriber or view counts, upload cadence, "@" handles, "his channel", "the channel we'd build for her", or a person listed among people we want to work with on YouTube. A one-off documentary or series remains a Format or a Project even when it will be posted on YouTube; the distinction is a running channel versus a single title.
- When a source lists things a person's channel could make — a doc series, a podcast, a recurring bit, "content with the dogs" — those belong in that channel's \`ideas\` field, one per line, not as a Format each.
- Propose "archive" (never delete) only when the source clearly says a record is no longer valid (project cancelled, rep relationship ended, company dissolved), with the reason.
- For updates to fields that may already have content, write the value as the complete new text; the reviewer sees a before/after diff. In the rationale, say which sentences changed and why.
- Mark sensitive: true on anything about compensation, deal terms, fees, personal phone numbers, home addresses, health, or family details. Still propose it.
- Emit "note" changes for relevant facts with no schema home so nothing is silently dropped; attach to a record when one is clear.
- A status changes only when the source says so about the record itself. One party's decision is not the record's status: a buyer passing, a brand declining, a partner dropping out, or a single meeting going badly is a fact about that relationship — record it as a note against the record and leave the status alone. Where nothing states a status, say so in the rationale rather than choosing one.
- When a document is organised under headings that name a state (IN PRODUCTION, ON HOLD, DEVELOPMENT ARCHIVE, COMPLETED, TRACKING), the heading a record sits under is the authority on its status and outranks anything implied by discussion elsewhere. A status line under that heading is more specific still: use the heading for the overall state and the status line for the detail.
- Dates in the source belong on the record: when the text carries a date for when something last moved, set lastActivityAt. Never invent one.
- "rename" when the source gives a record's correct or new name (a working title that became the real title, a misspelt person). The page keeps its address; the old name is kept as an alias.
- "convert" when a record is in the wrong part of the Repo, not merely wrong in a field: a Format that is actually an existing production (→ project), a Project that is really an internal concept in development (→ format), a Talent who is really an industry contact — agent, manager, executive (→ person), an industry person who is really talent (→ creator), or a Format/Project that is really a running athlete channel (→ channel). Everything on the record moves with it. Put any fields for the new record, including its status, in "fields".
- "unlink" when the source says a connection on a record is wrong or over: a rep no longer represents someone, a company is not involved, a person was never on that project. Removing a connection is not archiving either record.
- "restore" when the source says an archived record is back: revived, un-shelved, picked up again.
- If an earlier email in this thread already established a fact (listed under ALREADY CAPTURED), do not re-propose it.
- Respond ONLY by calling the submit_changes tool.

${describeOpVocabulary()}`;
}

function chunkText(text: string): { text: string; offset: number }[] {
  if (text.length <= CHUNK_SIZE) return [{ text, offset: 0 }];
  const chunks: { text: string; offset: number }[] = [];
  let start = 0;
  while (start < text.length && chunks.length < MAX_CHUNKS) {
    chunks.push({ text: text.slice(start, start + CHUNK_SIZE), offset: start });
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

async function threadContext(item: { id: string; threadId: string | null }): Promise<string> {
  if (!item.threadId) return "";
  const siblings = await db.ingestItem.findMany({
    where: { threadId: item.threadId, id: { not: item.id } },
    select: { id: true },
  });
  if (!siblings.length) return "";
  const applied = await db.ingestChange.findMany({
    where: { itemId: { in: siblings.map((s) => s.id) }, status: { in: ["applied", "approved", "edited"] } },
    select: { group: true, opType: true, after: true },
    take: 30,
  });
  if (!applied.length) return "";
  return [
    "ALREADY CAPTURED FROM EARLIER IN THIS EMAIL THREAD (do not re-propose):",
    ...applied.map((c) => `- [${c.opType}] ${c.group}: ${JSON.stringify(c.after).slice(0, 140)}`),
  ].join("\n");
}

type Destination = {
  targetType: string | null;
  targetId: string | null;
  linkKind?: string;
  field?: string;
  path: string | null;
  name: string;
};

function opDestination(op: ProposedOp, byDigestId: Map<string, DigestCandidate>, byName: Map<string, DigestCandidate>): Destination {
  const find = (id?: string, name?: string, type?: string) => {
    const hit = (id ? byDigestId.get(id) : undefined) ?? (name && type ? byName.get(`${type}:${name.toLowerCase()}`) : undefined);
    return hit && (!type || hit.targetType === type) ? hit : undefined;
  };
  switch (op.op) {
    case "create":
      return { targetType: op.targetType, targetId: null, path: null, name: op.name };
    case "update": {
      const hit = find(op.targetId, op.targetName, op.targetType);
      const spec = RECORD_REGISTRY[op.targetType];
      return {
        targetType: op.targetType, targetId: hit?.targetId ?? null, field: op.field,
        path: hit ? spec.path(hit.slug) : null, name: hit?.name ?? op.targetName,
      };
    }
    case "link": {
      const spec = LINK_SPECS[op.kind as keyof typeof LINK_SPECS];
      const aHit = find(op.aId, op.aName, spec.a.targetType);
      const aSpec = RECORD_REGISTRY[spec.a.targetType];
      return {
        targetType: spec.a.targetType, targetId: aHit?.targetId ?? null, linkKind: op.kind,
        path: aHit ? aSpec.path(aHit.slug) : null, name: aHit?.name ?? op.aName,
      };
    }
    case "archive": {
      const hit = find(op.targetId, op.targetName, op.targetType);
      const spec = RECORD_REGISTRY[op.targetType];
      return {
        targetType: op.targetType, targetId: hit?.targetId ?? null,
        path: hit ? spec.path(hit.slug) : null, name: hit?.name ?? op.targetName,
      };
    }
    case "note": {
      const hit = find(op.aboutId, op.aboutName, op.aboutType);
      const spec = op.aboutType ? RECORD_REGISTRY[op.aboutType] : null;
      return {
        targetType: op.aboutType ?? null, targetId: hit?.targetId ?? null,
        path: hit && spec ? spec.path(hit.slug) : null, name: hit?.name ?? op.aboutName ?? "This item",
      };
    }
    case "rename": {
      const hit = find(op.targetId, op.targetName, op.targetType);
      const spec = RECORD_REGISTRY[op.targetType];
      // The name field is the "field" so undo can put the old name back the same way it puts back any other field.
      return {
        targetType: op.targetType, targetId: hit?.targetId ?? null, field: spec.nameField,
        path: hit ? spec.path(hit.slug) : null, name: hit?.name ?? op.targetName,
      };
    }
    case "unlink": {
      const spec = LINK_SPECS[op.kind as keyof typeof LINK_SPECS];
      const aHit = find(op.aId, op.aName, spec.a.targetType);
      const aSpec = RECORD_REGISTRY[spec.a.targetType];
      return {
        targetType: spec.a.targetType, targetId: aHit?.targetId ?? null, linkKind: op.kind,
        path: aHit ? aSpec.path(aHit.slug) : null, name: aHit?.name ?? op.aName,
      };
    }
    case "restore": {
      const hit = find(op.targetId, op.targetName, op.targetType);
      const spec = RECORD_REGISTRY[op.targetType];
      return {
        targetType: op.targetType, targetId: hit?.targetId ?? null, field: "archived",
        path: hit ? spec.path(hit.slug) : null, name: hit?.name ?? op.targetName,
      };
    }
    case "convert": {
      const hit = find(op.targetId, op.targetName, op.targetType);
      const spec = RECORD_REGISTRY[op.targetType];
      return {
        targetType: op.targetType, targetId: hit?.targetId ?? null,
        path: hit ? spec.path(hit.slug) : null, name: hit?.name ?? op.targetName,
      };
    }
  }
}

const OP_ORDER: Record<string, number> = { restore: 0, create: 0, rename: 50, update: 100, unlink: 150, link: 200, archive: 300, convert: 350, note: 400 };

/** Current DB value for an update op's field (before), plus record version. */
async function captureBefore(op: Extract<ProposedOp, { op: "update" }>, targetId: string): Promise<{ before: unknown; version: number | null }> {
  const spec = RECORD_REGISTRY[op.targetType];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const record = await (db as any)[spec.prismaModel].findUnique({ where: { id: targetId } });
  if (!record) return { before: null, version: null };
  return { before: record[op.field] ?? null, version: spec.hasVersion ? record.version : null };
}

async function linkAlreadyExists(op: { kind: string; role?: string }, aId: string | null, bId: string | null): Promise<boolean> {
  if (!aId || !bId) return false;
  const spec = LINK_SPECS[op.kind as keyof typeof LINK_SPECS];
  if (op.kind === "channel_creator") {
    return !!(await db.channel.findFirst({ where: { id: aId, creatorId: bId }, select: { id: true } }));
  }
  const where: Record<string, unknown> = { [spec.a.idField]: aId, [spec.b.idField]: bId };
  const tableByKind: Record<string, string> = {
    creator_entity: "creatorEntityLink", creator_format: "creatorFormat", creator_project: "creatorProjectCredit",
    creator_org: "creatorOrganization", creator_person: "creatorPerson", creator_creator: "creatorRelationship",
    project_org: "projectOrganization", project_entity: "projectEntityLink", project_person: "personProject",
    format_entity: "formatEntityLink", format_org: "formatOrganization",
    channel_org: "channelOrganization", channel_person: "channelPerson",
    person_org: "personOrganization",
    opportunity_creator: "opportunityCreator", opportunity_format: "opportunityFormat",
    opportunity_project: "opportunityProject", opportunity_org: "opportunityOrganization",
    opportunity_entity: "opportunityEntityLink",
  };
  const table = tableByKind[op.kind];
  if (!table) return false;
  if (spec.roleField === "role" && op.role) where.role = op.role;
  if (spec.roleField === "relationship" && op.role) where.relationship = op.role;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (db as any)[table].findFirst({ where });
  return !!existing;
}

function evidenceWithOffsets(snippets: string[], text: string): { snippet: string; start: number; end: number }[] {
  return snippets.map((snippet) => {
    const idx = text.indexOf(snippet.trim().slice(0, 200));
    return { snippet, start: idx, end: idx >= 0 ? idx + snippet.length : -1 };
  });
}

export async function proposeItemCore(
  itemId: string,
  runner: ModelRunner = anthropicRunner,
): Promise<StageResult> {
  const item = await db.ingestItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: "Item not found." };
  if (!["triaged", "proposed", "failed"].includes(item.status)) {
    return { ok: false, error: `Cannot propose for an item in status "${item.status}" — triage it first.` };
  }
  if (runner === anthropicRunner && !ingestAiAvailable()) {
    return { ok: false, error: "Proposals need ANTHROPIC_API_KEY. The document is parsed and stored." };
  }
  const text = (item.extractedText ?? "").trim();
  if (!text) return { ok: false, error: "No text to propose from." };

  try {
    const candidates = await matchCandidates(text);
    const byDigestId = new Map(candidates.map((c) => [c.id, c]));
    const byName = new Map(candidates.map((c) => [`${c.targetType}:${c.name.toLowerCase()}`, c]));
    const thread = await threadContext(item);
    const chunks = chunkText(text);

    const collected: ProposedOp[] = [];
    for (const chunk of chunks) {
      const { output, usage } = await runner({
        model: PROPOSE_MODEL,
        maxTokens: 16_000,
        systemStable: proposeSystem(),
        webSearch: item.webResearch,
        userContent: [
          candidateBlock(candidates),
          thread,
          workspaceRules(item),
          item.webResearch ? WEB_RESEARCH_RULES : "",
          uploaderContext(item),
          describeSource(item),
          chunks.length > 1 ? `(Part ${chunks.indexOf(chunk) + 1} of ${chunks.length} of a long document)` : "",
          "DOCUMENT TEXT:",
          chunk.text,
        ].filter(Boolean).join("\n\n"),
        toolName: "submit_changes",
        toolDescription: "Submit every proposed database change supported by this document.",
        toolSchema: proposalToolSchema(),
      });
      await recordUsage(itemId, "propose", usage);
      // Parse ops one by one — a single malformed proposal is dropped, not
      // allowed to fail the whole batch.
      const rawChanges = (output as { changes?: unknown[] })?.changes;
      let droppedMalformed = 0;
      for (const raw of (Array.isArray(rawChanges) ? rawChanges : []).slice(0, 80)) {
        const parsed = proposedOpSchema.safeParse(raw);
        if (parsed.success) collected.push(parsed.data);
        else droppedMalformed++;
      }
      if (droppedMalformed) console.warn(`Ingest ${itemId}: dropped ${droppedMalformed} malformed proposal(s).`);
    }

    // Mechanical dedupe across chunks + registry validation
    const seen = new Set<string>();
    const invalid: string[] = [];
    const rows: {
      group: string; destination: Destination; opType: string; payload: ProposedOp;
      before: unknown; after: unknown; confidence: number; rationale: string;
      evidence: unknown; sensitive: boolean; sortOrder: number;
    }[] = [];

    for (const rawOp of collected) {
      const validated = validateOp(rawOp);
      if (!validated.ok) {
        invalid.push(validated.error);
        continue;
      }
      const op = validated.op;
      const destination = opDestination(op, byDigestId, byName);

      let before: unknown = null;
      let after: unknown;
      let payload: ProposedOp = op;

      if (op.op === "update") {
        if (destination.targetId) {
          const captured = await captureBefore(op, destination.targetId);
          before = captured.before;
          payload = { ...op, targetId: destination.targetId } as ProposedOp;
          if (captured.version != null) {
            (payload as Record<string, unknown>).expectedVersion = captured.version;
          }
          // Value identical to current — nothing to change
          if (String(captured.before ?? "") === String(op.value)) continue;
        }
        after = op.value;
      } else if (op.op === "link") {
        const spec = LINK_SPECS[op.kind as keyof typeof LINK_SPECS];
        const aHit = op.aId ? byDigestId.get(op.aId) : byName.get(`${spec.a.targetType}:${op.aName.toLowerCase()}`);
        const bHit = op.bId ? byDigestId.get(op.bId) : byName.get(`${spec.b.targetType}:${op.bName.toLowerCase()}`);
        if (await linkAlreadyExists(op, aHit?.targetId ?? null, bHit?.targetId ?? null)) continue;
        payload = { ...op, aId: aHit?.targetId ?? undefined, bId: bHit?.targetId ?? undefined } as ProposedOp;
        after = { kind: op.kind, a: op.aName, b: op.bName, role: op.role ?? null };
      } else if (op.op === "create") {
        if (byName.get(`${op.targetType}:${op.name.toLowerCase()}`)) continue; // exists — links will reference it
        after = { name: op.name, ...op.fields };
      } else if (op.op === "archive") {
        payload = { ...op, targetId: destination.targetId ?? undefined } as ProposedOp;
        after = { archived: true, reason: op.reason };
      } else if (op.op === "rename") {
        payload = { ...op, targetId: destination.targetId ?? undefined } as ProposedOp;
        before = destination.targetId ? destination.name : null;
        after = op.newName;
        if (before === after) continue;
      } else if (op.op === "unlink") {
        const spec = LINK_SPECS[op.kind as keyof typeof LINK_SPECS];
        const aHit = op.aId ? byDigestId.get(op.aId) : byName.get(`${spec.a.targetType}:${op.aName.toLowerCase()}`);
        const bHit = op.bId ? byDigestId.get(op.bId) : byName.get(`${spec.b.targetType}:${op.bName.toLowerCase()}`);
        // Nothing to remove if both sides are known and the connection isn't there.
        if (aHit && bHit && !(await linkAlreadyExists({ kind: op.kind }, aHit.targetId, bHit.targetId))) continue;
        payload = { ...op, aId: aHit?.targetId ?? undefined, bId: bHit?.targetId ?? undefined } as ProposedOp;
        after = { kind: op.kind, a: op.aName, b: op.bName, role: op.role ?? null, removed: true };
      } else if (op.op === "restore") {
        payload = { ...op, targetId: destination.targetId ?? undefined } as ProposedOp;
        before = true;
        after = { archived: false };
      } else if (op.op === "convert") {
        payload = { ...op, targetId: destination.targetId ?? undefined } as ProposedOp;
        after = { movedTo: op.toType, name: op.newName ?? destination.name };
      } else if (op.op === "note") {
        after = { text: op.text };
      }

      const key = JSON.stringify({ op: op.op, d: destination, a: after });
      if (seen.has(key)) continue;
      seen.add(key);

      const spec = destination.targetType ? RECORD_REGISTRY[destination.targetType as IngestTargetType] : null;
      const group =
        op.op === "note" && !destination.targetType
          ? "Notes"
          : op.op === "create"
            ? `New · ${spec?.displayName ?? destination.targetType}`
            : `${spec?.displayName ?? "Record"} › ${destination.name}`;

      rows.push({
        group,
        destination,
        opType: op.op === "archive" ? "archive" : op.op,
        payload,
        before,
        after,
        confidence: op.confidence,
        rationale: op.rationale,
        evidence: evidenceWithOffsets(op.evidence, text),
        sensitive: op.sensitive,
        sortOrder: (OP_ORDER[op.op] ?? 500) + (op.sensitive ? 1000 : 0),
      });
    }

    // Replace prior un-reviewed proposals; keep applied history
    await db.ingestChange.deleteMany({
      where: { itemId, status: { in: ["pending", "rejected", "superseded", "approved", "edited"] } },
    });
    let order = 0;
    for (const row of [...rows].sort((a, b) => a.sortOrder - b.sortOrder)) {
      await db.ingestChange.create({
        data: {
          itemId,
          group: row.group,
          destination: row.destination as object,
          opType: row.opType,
          payload: row.payload as object,
          before: row.before === null ? undefined : (row.before as object),
          after: row.after as object,
          confidence: row.confidence,
          rationale: row.rationale,
          evidence: row.evidence as object,
          sensitive: row.sensitive,
          sortOrder: order++,
        },
      });
    }

    await db.ingestItem.update({
      where: { id: itemId },
      data: {
        status: "proposed",
        error: null,
        metadata: {
          ...((item.metadata as object) ?? {}),
          proposeInfo: {
            chunks: chunks.length,
            coveredChars: Math.min(text.length, CHUNK_SIZE + (chunks.length - 1) * (CHUNK_SIZE - CHUNK_OVERLAP)),
            totalChars: text.length,
            invalidOps: invalid.length ? invalid.slice(0, 10) : undefined,
            droppedAsDuplicate: collected.length - rows.length - invalid.length,
          },
        },
      },
    });
    return { ok: true, status: "proposed" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Propose failed.";
    await db.ingestItem.update({ where: { id: itemId }, data: { status: "failed", error: message } });
    return { ok: false, error: message };
  }
}
