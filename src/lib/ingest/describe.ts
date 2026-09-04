// One plain-English sentence for a proposed change. The review board has room
// for evidence, rationale and a diff; the note box has room for a line — and a
// line is all you need to decide whether "move this to on hold" was understood.

import { LINK_SPECS, RECORD_REGISTRY, type IngestTargetType } from "@/lib/ingest/registry";
import { labelFor } from "@/lib/taxonomy";
import type { ProposedOp } from "@/lib/ingest/ops";

const displayName = (t: IngestTargetType) => RECORD_REGISTRY[t]?.displayName ?? t;

function fieldLabel(targetType: IngestTargetType, field: string): string {
  return RECORD_REGISTRY[targetType]?.fields.find((f) => f.name === field)?.label ?? field;
}

function shorten(value: unknown, max = 120): string {
  const s = String(value ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** A vocab value reads as its label ("On Hold"), anything else as itself. */
function readable(targetType: IngestTargetType, field: string, value: unknown): string {
  const spec = RECORD_REGISTRY[targetType]?.fields.find((f) => f.name === field);
  if (spec?.kind === "vocab") return labelFor(String(value)) || shorten(value);
  return shorten(value);
}

export function describeOp(op: ProposedOp): string {
  switch (op.op) {
    case "create": {
      const extras = Object.entries(op.fields ?? {})
        .map(([k, v]) => `${fieldLabel(op.targetType, k)} ${readable(op.targetType, k, v)}`)
        .slice(0, 3)
        .join(", ");
      return `Add a new ${displayName(op.targetType).toLowerCase()}: ${op.name}${extras ? ` (${extras})` : ""}`;
    }
    case "update":
      return `${op.targetName} — set ${fieldLabel(op.targetType, op.field)} to ${readable(op.targetType, op.field, op.value)}`;
    case "link": {
      const spec = LINK_SPECS[op.kind as keyof typeof LINK_SPECS];
      const role = op.role ? ` as ${labelFor(op.role) || op.role}` : "";
      return spec
        ? `Connect ${op.aName} to ${op.bName}${role}`
        : `Connect ${op.aName} to ${op.bName}`;
    }
    case "archive":
      return `Move ${op.targetName} to the Archive — ${shorten(op.reason, 80)}`;
    case "note":
      return op.aboutName
        ? `Note on ${op.aboutName}: ${shorten(op.text, 140)}`
        : `Note: ${shorten(op.text, 140)}`;
    case "rename":
      return `Rename ${op.targetName} to "${op.newName}"`;
    case "unlink": {
      const role = op.role ? ` (${labelFor(op.role) || op.role})` : "";
      return `Remove the connection between ${op.aName} and ${op.bName}${role}`;
    }
    case "restore":
      return `Bring ${op.targetName} back out of the Archive`;
    case "convert": {
      const to = displayName(op.toType);
      const as = op.newName && op.newName !== op.targetName ? ` as "${op.newName}"` : "";
      return `Move ${op.targetName} to ${to === "Talent" ? "Talent" : `${to}s`}${as} — everything on the page goes with it, and the old address forwards`;
    }
  }
}
