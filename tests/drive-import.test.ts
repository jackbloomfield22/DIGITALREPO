import { describe, it, expect } from "vitest";
import {
  consolidateBatches,
  importTotals,
  parseBundle,
  IMPORT_PHASES,
} from "@/lib/drive-import";

describe("bundle parsing", () => {
  it("accepts an array, a { batches } wrapper, or a bare batch", () => {
    const batch = { organizations: [{ name: "Fulwell 73" }] };
    expect(parseBundle([batch])).toHaveLength(1);
    expect(parseBundle({ title: "x", batches: [batch, batch] })).toHaveLength(2);
    expect(parseBundle(batch)).toEqual([batch]);
  });

  it("rejects anything that isn't an object or array", () => {
    expect(() => parseBundle("nope")).toThrow();
    expect(() => parseBundle(null)).toThrow();
  });
});

describe("consolidation across batches", () => {
  it("merges the same organization mentioned in several files", () => {
    const c = consolidateBatches([
      { organizations: [{ name: "Fulwell 73", types: ["production_company"], notes: "Met 6/4." }] },
      { organizations: [{ name: "fulwell 73", website: "https://fulwell73.com", notes: "Pitched Foul Play." }] },
    ]);
    expect(c.orgs).toHaveLength(1);
    expect(c.orgs[0].name).toBe("Fulwell 73");
    expect(c.orgs[0].website).toBe("https://fulwell73.com");
    expect(c.orgs[0].notes).toEqual(["Met 6/4.", "Pitched Foul Play."]);
  });

  it("does not repeat an identical note seen twice", () => {
    const c = consolidateBatches([
      { organizations: [{ name: "UTA", notes: "Agency partner." }] },
      { organizations: [{ name: "UTA", notes: "Agency partner." }] },
    ]);
    expect(c.orgs[0].notes).toEqual(["Agency partner."]);
  });

  it("reads projects and formats from both array and keyed-object shapes", () => {
    const c = consolidateBatches([
      { projects: { "Foul Play": { status: "released", logline: "A caper." } } },
      { projects: [{ title: "Foul Play", premiereYear: 2025 }] },
      { formats: [{ title: "BROKE", status: "developing" }] },
    ]);
    expect(c.projects).toHaveLength(1);
    expect(c.projects[0].logline).toBe("A caper.");
    expect(c.projects[0].premiereYear).toBe(2025);
    expect(c.formats[0].title).toBe("BROKE");
  });

  it("skips format entries explicitly marked noop", () => {
    const c = consolidateBatches([{ formats: [{ title: "Shelved", noop: true }] }]);
    expect(c.formats).toHaveLength(0);
  });

  it("gives every person named on a project their own record", () => {
    const c = consolidateBatches([
      { projects: [{ title: "The Captains", people: [{ name: "Jane Doe", role: "EP" }] }] },
    ]);
    expect(c.people.map((p) => p.name)).toContain("Jane Doe");
  });

  it("expands the NIL roster rows into athlete talent", () => {
    const c = consolidateBatches([
      { klutch_nil_roster_aug2025: ["SOURCE: roster doc", "Sample Player — State University"] },
    ]);
    const t = c.talent.find((x) => x.name === "Sample Player");
    expect(t?.types).toContain("Athlete");
    expect(t?.sports).toContain("Football");
    expect(t?.notes[0]).toContain("State University");
  });

  it("ignores provenance-only keys and unknown sections", () => {
    const c = consolidateBatches([{ source: "doc.gdoc", extraction_note: "partial", mystery: [1, 2] }]);
    expect(Object.values(importTotals(c)).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("survives junk entries without throwing", () => {
    const c = consolidateBatches([null, "text", 42, { organizations: [null, {}, { name: "" }] }]);
    expect(c.orgs).toHaveLength(0);
  });
});

describe("totals", () => {
  it("counts every phase and matches the phase list", () => {
    const c = consolidateBatches([
      {
        organizations: [{ name: "A" }],
        people: [{ name: "B" }],
        talent: [{ name: "C" }],
        projects: [{ title: "D" }],
        formats: [{ title: "E" }],
        opportunities: [{ title: "F" }],
      },
    ]);
    const totals = importTotals(c);
    expect(Object.keys(totals).sort()).toEqual([...IMPORT_PHASES].sort());
    expect(Object.values(totals)).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

describe("dates and held statuses", () => {
  it("carries lastActivityAt through and keeps the most recent", () => {
    const c = consolidateBatches([
      { formats: [{ title: "The Process", lastActivityAt: "2026-01-27" }] },
      { formats: [{ title: "The Process", lastActivityAt: "2026-08-24" }] },
      { formats: [{ title: "The Process", lastActivityAt: "2026-02-23" }] },
    ]);
    expect(c.formats).toHaveLength(1);
    expect(c.formats[0].lastActivityAt).toBe("2026-08-24");
  });

  it("keeps dates on opportunities and projects too", () => {
    const c = consolidateBatches([
      { opportunities: [{ title: "USA Handball", lastActivityAt: "2026-08-24" }] },
      { projects: [{ title: "Foul Play", lastActivityAt: "2026-07-01" }] },
    ]);
    expect(c.opportunities[0].lastActivityAt).toBe("2026-08-24");
    expect(c.projects[0].lastActivityAt).toBe("2026-07-01");
  });

  it("leaves the date unset when the source never gave one", () => {
    const c = consolidateBatches([{ formats: [{ title: "Undated idea" }] }]);
    expect(c.formats[0].lastActivityAt).toBeUndefined();
  });
});
