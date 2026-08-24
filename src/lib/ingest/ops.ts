// The op vocabulary the model produces and the apply engine consumes.
// The JSON schema sent to the model and the zod validation of its output are
// both generated from the registry — the model has no hand-written knowledge
// of the site's schema.

import { z } from "zod";
import {
  INGEST_LINK_KINDS,
  LINK_SPECS,
  RECORD_REGISTRY,
  type IngestTargetType,
} from "@/lib/ingest/registry";
import { ENTITY_KINDS } from "@/lib/taxonomy";

const TARGET_TYPES = Object.keys(RECORD_REGISTRY) as IngestTargetType[];

const targetType = z.enum(TARGET_TYPES as [IngestTargetType, ...IngestTargetType[]]);
const confidence = z.number().min(0).max(1).default(0.6);

// Model output is advisory text, not user input — an over-long string means
// the model was chatty, not that the document is bad. Clamp to the cap
// instead of failing the whole item ("Too big: expected string…").
const clamp = (max: number) => z.string().transform((s) => (s.length > max ? s.slice(0, max) : s));
const clampMin = (min: number, max: number) =>
  z.string().min(min).transform((s) => (s.length > max ? s.slice(0, max) : s));
const clampArr = <S extends z.ZodTypeAny>(schema: S, max: number) =>
  z.array(schema).transform((a) => (a.length > max ? a.slice(0, max) : a));

const evidence = z.array(clampMin(3, 600)).min(1).transform((a) => a.slice(0, 4));

const baseChange = {
  confidence,
  rationale: z.string().default("").transform((s) => (s.length > 1000 ? s.slice(0, 1000) : s)),
  evidence,
  sensitive: z.boolean().default(false),
};

export const proposedOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("create"),
    targetType,
    name: clampMin(1, 300),
    entityKind: clamp(30).optional(), // for targetType entity
    fields: z.record(z.string(), z.union([clamp(8000), z.number()])).optional(),
    ...baseChange,
  }),
  z.object({
    op: z.literal("update"),
    targetType,
    targetName: clampMin(1, 300),
    targetId: clamp(50).optional(),
    field: clampMin(1, 60),
    value: z.union([clamp(8000), z.number()]),
    ...baseChange,
  }),
  z.object({
    op: z.literal("link"),
    kind: z.enum(INGEST_LINK_KINDS as [string, ...string[]]),
    aName: clampMin(1, 300),
    aId: clamp(50).optional(),
    bName: clampMin(1, 300),
    bId: clamp(50).optional(),
    role: clamp(60).optional(),
    entityKind: clamp(30).optional(), // when side b is a taxonomy entity
    ...baseChange,
  }),
  z.object({
    op: z.literal("archive"),
    targetType,
    targetName: clampMin(1, 300),
    targetId: clamp(50).optional(),
    reason: clampMin(3, 500),
    ...baseChange,
  }),
  z.object({
    op: z.literal("note"),
    text: clampMin(3, 2000),
    aboutType: targetType.optional(),
    aboutName: clamp(300).optional(),
    aboutId: clamp(50).optional(),
    ...baseChange,
  }),
]);

export type ProposedOp = z.infer<typeof proposedOpSchema>;

export const proposalOutputSchema = z.object({
  changes: clampArr(proposedOpSchema, 80),
});

const candidate = z.object({ targetType, name: clampMin(1, 300) });

// The list fields are advisory context for the propose stage — a malformed
// entry degrades them to empty rather than failing the verdict.
export const triageOutputSchema = z.object({
  relevant: z.boolean(),
  score: z.number().min(0).max(1),
  reasons: clampArr(clamp(300), 6).catch([]),
  candidateRecords: clampArr(candidate, 20).default([]).catch([]),
  newRecordCandidates: clampArr(candidate, 20).default([]).catch([]),
  sections: clampArr(clamp(200), 12).default([]).catch([]),
});
export type TriageOutput = z.infer<typeof triageOutputSchema>;

/**
 * Registry-aware semantic validation beyond structure: fields must be
 * ingest-editable for the type, vocab values must come from the vocabulary,
 * link roles from their role vocab. Returns a cleaned op or an error string.
 */
export function validateOp(op: ProposedOp): { ok: true; op: ProposedOp } | { ok: false; error: string } {
  const norm = (v: string) => v.trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (op.op === "create") {
    const spec = RECORD_REGISTRY[op.targetType];
    if (op.targetType === "entity") {
      const kind = norm(op.entityKind ?? "");
      if (!(ENTITY_KINDS as readonly string[]).includes(kind)) {
        return { ok: false, error: `create entity: unknown kind "${op.entityKind}"` };
      }
      return { ok: true, op: { ...op, entityKind: kind } };
    }
    const fields: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(op.fields ?? {})) {
      const field = spec.fields.find((f) => f.name === key);
      if (!field || !spec.createFields.includes(key)) continue; // silently drop non-creatable fields
      if (field.kind === "vocab") {
        const v = norm(String(value));
        if (!field.vocab!().some((o) => o.value === v)) continue;
        fields[key] = v;
      } else fields[key] = value;
    }
    return { ok: true, op: { ...op, fields } };
  }

  if (op.op === "update") {
    const spec = RECORD_REGISTRY[op.targetType];
    const field = spec.fields.find((f) => f.name === op.field);
    if (!field) {
      return { ok: false, error: `update ${op.targetType}: field "${op.field}" is not ingest-editable` };
    }
    let value = op.value;
    if (field.kind === "vocab") {
      const v = norm(String(value));
      if (!field.vocab!().some((o) => o.value === v)) {
        return { ok: false, error: `update ${op.targetType}.${op.field}: "${value}" is not in the vocabulary` };
      }
      value = v;
    }
    if (field.kind === "number" || field.kind === "year") {
      const n = Number(value);
      if (Number.isNaN(n)) return { ok: false, error: `update ${op.targetType}.${op.field}: not a number` };
      value = n;
    }
    if (typeof value === "string" && field.maxLength && value.length > field.maxLength) {
      value = value.slice(0, field.maxLength);
    }
    return { ok: true, op: { ...op, value } };
  }

  if (op.op === "link") {
    const spec = LINK_SPECS[op.kind as keyof typeof LINK_SPECS];
    if (!spec?.ingest) return { ok: false, error: `link: kind "${op.kind}" is not available to ingest` };
    let role = op.role ? norm(op.role) : undefined;
    if (spec.roleField) {
      const options = spec.roleVocab?.() ?? [];
      if (role && !options.some((o) => o.value === role)) {
        const other = options.find((o) => o.value === "other");
        if (op.kind === "creator_entity") role = undefined; // relationship optional
        else if (other) role = "other";
        else return { ok: false, error: `link ${op.kind}: role "${op.role}" is not in the vocabulary` };
      }
      if (!role && op.kind !== "creator_entity" && op.kind !== "format_org") {
        // Kinds whose payload requires a role get a safe default
        const fallback = options.find((o) => o.value === "other") ?? options[0];
        if (["creator_project", "creator_org", "creator_person", "creator_creator", "project_org", "project_person"].includes(op.kind)) {
          role = fallback?.value;
        }
      }
    }
    if (spec.b.targetType === "entity" || spec.a.targetType === "entity") {
      const kind = norm(op.entityKind ?? "interest");
      if (!(ENTITY_KINDS as readonly string[]).includes(kind)) {
        return { ok: false, error: `link ${op.kind}: unknown entity kind "${op.entityKind}"` };
      }
      return { ok: true, op: { ...op, role, entityKind: kind } };
    }
    return { ok: true, op: { ...op, role } };
  }

  if (op.op === "archive") {
    const spec = RECORD_REGISTRY[op.targetType];
    if (!["creator", "project", "organization", "format", "person", "opportunity"].includes(spec.targetType)) {
      return { ok: false, error: `archive: ${op.targetType} records cannot be archived by ingest` };
    }
  }
  return { ok: true, op };
}

// ---------------------------------------------------------------------------
// Prompt-facing documentation of the vocabulary, generated at call time.
// ---------------------------------------------------------------------------

export function describeOpVocabulary(): string {
  const lines: string[] = [];
  lines.push("RECORD TYPES AND THEIR INGEST-EDITABLE FIELDS:");
  for (const spec of Object.values(RECORD_REGISTRY)) {
    const fields = spec.fields
      .map((f) => {
        if (f.kind === "vocab") return `${f.name} (one of: ${f.vocab!().map((o) => o.value).join("|")})`;
        if (f.kind === "number" || f.kind === "year") return `${f.name} (number)`;
        if (f.kind === "date") return `${f.name} (YYYY-MM-DD)`;
        return f.name;
      })
      .join(", ");
    lines.push(`- ${spec.targetType} ("${spec.displayName}"): ${fields || "(name only)"}`);
  }
  lines.push("");
  lines.push(`ENTITY KINDS (taxonomy): ${ENTITY_KINDS.join(", ")}`);
  lines.push("");
  lines.push("LINK KINDS (relationships between records):");
  for (const kind of INGEST_LINK_KINDS) {
    const spec = LINK_SPECS[kind as keyof typeof LINK_SPECS];
    const role = spec.roleField
      ? ` role/${spec.roleField}: ${spec.roleVocab?.().map((o) => o.value).filter(Boolean).join("|") ?? "free"}`
      : "";
    lines.push(`- ${kind}: a=${spec.a.targetType}, b=${spec.b.targetType}.${role}${spec.note ? ` ${spec.note}` : ""}`);
  }
  return lines.join("\n");
}

/** JSON Schema for the propose tool input (loose structure; zod is strict). */
export function proposalToolSchema(): Record<string, unknown> {
  const str = { type: "string" };
  return {
    type: "object",
    properties: {
      changes: {
        type: "array",
        description: "Every discrete change supported by the source text.",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: ["create", "update", "link", "archive", "note"] },
            targetType: { type: "string", enum: TARGET_TYPES },
            name: str,
            entityKind: str,
            fields: { type: "object", additionalProperties: true },
            targetName: str,
            targetId: { ...str, description: "Digest id when the destination matched an existing record" },
            field: str,
            value: {},
            kind: { type: "string", enum: INGEST_LINK_KINDS },
            aName: str,
            aId: str,
            bName: str,
            bId: str,
            role: str,
            reason: str,
            text: str,
            aboutType: { type: "string", enum: TARGET_TYPES },
            aboutName: str,
            aboutId: str,
            confidence: { type: "number", minimum: 0, maximum: 1 },
            rationale: str,
            evidence: { type: "array", items: str, description: "Verbatim snippets copied exactly from the source text" },
            sensitive: { type: "boolean" },
          },
          required: ["op", "confidence", "rationale", "evidence"],
        },
      },
    },
    required: ["changes"],
  };
}

export function triageToolSchema(): Record<string, unknown> {
  const str = { type: "string" };
  const rec = {
    type: "object",
    properties: { targetType: { type: "string", enum: TARGET_TYPES }, name: str },
    required: ["targetType", "name"],
  };
  return {
    type: "object",
    properties: {
      relevant: { type: "boolean" },
      score: { type: "number", minimum: 0, maximum: 1 },
      reasons: { type: "array", items: str },
      candidateRecords: { type: "array", items: rec, description: "Existing records this document is about" },
      newRecordCandidates: { type: "array", items: rec, description: "People/companies/projects mentioned that appear to be new" },
      sections: { type: "array", items: str },
    },
    required: ["relevant", "score", "reasons"],
  };
}
