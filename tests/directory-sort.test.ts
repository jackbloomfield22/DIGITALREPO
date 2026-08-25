import { describe, it, expect } from "vitest";
import {
  nextSortValue,
  orderForFormats,
  orderForPeople,
  parseSort,
} from "@/lib/directory-sort";

describe("sort state in the URL", () => {
  it("reads a plain key as ascending and a -desc suffix as descending", () => {
    expect(parseSort("title", "date-desc")).toEqual({ key: "title", desc: false });
    expect(parseSort("date-desc", "title")).toEqual({ key: "date", desc: true });
  });

  it("falls back when the parameter is missing or empty", () => {
    expect(parseSort(undefined, "date-desc")).toEqual({ key: "date", desc: true });
    expect(parseSort("", "title")).toEqual({ key: "title", desc: false });
  });

  it("flips direction when the same column is clicked again", () => {
    const asc = { key: "title", desc: false };
    expect(nextSortValue("title", asc)).toBe("title-desc");
    expect(nextSortValue("title", { key: "title", desc: true })).toBe("title");
  });

  it("opens dates and counts largest-first, text smallest-first", () => {
    const other = { key: "title", desc: false };
    expect(nextSortValue("date", other)).toBe("date-desc");
    expect(nextSortValue("followers", other)).toBe("followers-desc");
    expect(nextSortValue("status", other)).toBe("status");
  });
});

describe("orderings", () => {
  it("puts records without a date last in both directions", () => {
    for (const desc of [true, false]) {
      const order = orderForFormats({ key: "date", desc }) as Record<string, unknown>[];
      expect(order[0]).toEqual({ lastActivityAt: { sort: desc ? "desc" : "asc", nulls: "last" } });
    }
  });

  it("breaks ties on a name so ordering is stable", () => {
    const byStatus = orderForFormats({ key: "status", desc: false }) as Record<string, unknown>[];
    expect(byStatus[1]).toEqual({ title: "asc" });
    const byRole = orderForPeople({ key: "role", desc: true }) as Record<string, unknown>[];
    expect(byRole[1]).toEqual({ name: "asc" });
  });

  it("falls back to the default ordering for an unknown key", () => {
    expect(orderForFormats({ key: "bogus", desc: false })).toEqual({ updatedAt: "asc" });
  });
});
