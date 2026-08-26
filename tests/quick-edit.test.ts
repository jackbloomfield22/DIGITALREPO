// The plain-English layer that sits between the model and the reviewer, and the
// status choices a row control is allowed to offer. Both are small, both are
// read by a human at the moment they decide whether to let a change through,
// and both are easy to get quietly wrong.

import { describe, it, expect } from "vitest";
import { describeOp } from "@/lib/ingest/describe";
import { allStatuses, statusOptionsFor, STATUS_TYPES } from "@/lib/row-status";
import type { ProposedOp } from "@/lib/ingest/ops";

const base = { confidence: 0.8, rationale: "", evidence: ["x"], sensitive: false };

describe("describeOp", () => {
  it("writes a status update the way a person would say it", () => {
    const op = { op: "update", targetType: "format", targetName: "Foul Play", field: "status", value: "on_hold", ...base } as ProposedOp;
    expect(describeOp(op)).toBe("Foul Play — set Status to On Hold");
  });

  it("never leaks a raw vocabulary value", () => {
    const ops: ProposedOp[] = [
      { op: "update", targetType: "project", targetName: "Foul Play", field: "status", value: "in_production", ...base },
      { op: "create", targetType: "format", name: "New Thing", fields: { status: "in_discussion" }, ...base },
      { op: "link", kind: "creator_project", aName: "Anthony Davis", bName: "Foul Play", role: "executive_producer", ...base },
    ];
    for (const op of ops) expect(describeOp(op)).not.toMatch(/_/);
  });

  it("names the record type for a create, and the reason for an archive", () => {
    expect(
      describeOp({ op: "create", targetType: "person", name: "Rich Paul", ...base } as ProposedOp),
    ).toBe("Add a new industry person: Rich Paul");
    expect(
      describeOp({ op: "archive", targetType: "format", targetName: "Dear Summer", reason: "Shelved", ...base } as ProposedOp),
    ).toBe("Move Dear Summer to the Archive — Shelved");
  });

  it("shortens a long note rather than filling the box with it", () => {
    const text = "x".repeat(400);
    const line = describeOp({ op: "note", text, aboutType: "format", aboutName: "Foul Play", ...base } as ProposedOp);
    expect(line.startsWith("Note on Foul Play: ")).toBe(true);
    expect(line.length).toBeLessThan(200);
  });
});

describe("row status choices", () => {
  it("offers every real status but never 'archived' — that is the Archive's job", () => {
    for (const type of STATUS_TYPES) {
      const options = statusOptionsFor(type);
      expect(options.length).toBeGreaterThan(0);
      expect(options.some((o) => o.value === "archived")).toBe(false);
      expect(options.length).toBe(allStatuses(type).filter((s) => s.value !== "archived").length);
    }
  });

  it("gives every choice a label a person can read", () => {
    for (const type of STATUS_TYPES) {
      for (const o of statusOptionsFor(type)) {
        expect(o.label).not.toMatch(/_/);
        expect(o.label[0]).toBe(o.label[0].toUpperCase());
      }
    }
  });
});
