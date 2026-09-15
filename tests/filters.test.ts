// The shared filter model: parsing from the URL (new and legacy shapes),
// writing back, chip labels, and the Prisma translation.

import { describe, it, expect } from "vitest";
import { parseFilterParams, applyFilterState, conditionLabel, serializeCondition, parseCondition, type FilterField } from "@/lib/filters";
import { filterWhere, conditionWhere } from "@/lib/filter-where";

const fields: FilterField[] = [
  { key: "status", label: "Status", kind: "select", legacy: "status", options: [{ value: "developing", label: "Developing" }, { value: "sold", label: "Sold" }] },
  { key: "talent", label: "Talent", kind: "lookup", lookupType: "creator", legacy: "creator" },
  { key: "types", label: "Type", kind: "multiselect", legacy: "type", options: [{ value: "brand", label: "Brand" }] },
  { key: "followers", label: "Followers", kind: "number", legacy: "min" },
  { key: "format", label: "Format", kind: "lookup", lookupType: "format", legacy: "format", presets: [{ value: "any", label: "Has a format" }, { value: "none", label: "No format" }] },
  { key: "updated", label: "Updated", kind: "date" },
  { key: "logline", label: "Logline", kind: "text" },
];

describe("filter URL state", () => {
  it("reads new-style conditions and one OR group", () => {
    const s = parseFilterParams({ f: ["status~any~developing,sold", "logline~contains~brazil"], or: ["talent~any~c1,c2", "types~any~brand"] }, fields);
    expect(s.and).toEqual([{ field: "status", op: "any", values: ["developing", "sold"] }, { field: "logline", op: "contains", values: ["brazil"] }]);
    expect(s.or).toHaveLength(2);
  });
  it("keeps old links working", () => {
    const s = parseFilterParams({ status: "developing", creator: ["c1", "c2"], type: "brand", min: "300000", format: "none" }, fields);
    expect(s.and).toEqual([
      { field: "status", op: "is", values: ["developing"] },
      { field: "talent", op: "any", values: ["c1", "c2"] },
      { field: "types", op: "any", values: ["brand"] },
      { field: "followers", op: "gt", values: ["300000"] },
      { field: "format", op: "empty", values: [] },
    ]);
  });
  it("drops what it cannot read and enforces arity", () => {
    expect(parseCondition("nope~is~x", fields)).toBeNull();
    expect(parseCondition("status~between~a", fields)).toBeNull();
    expect(parseCondition("updated~between~2026-01-01", fields)).toBeNull();
    expect(parseCondition("status~empty~", fields)).toEqual({ field: "status", op: "empty", values: [] });
    expect(parseCondition("status~is~a,b", fields)).toEqual({ field: "status", op: "is", values: ["a"] });
  });
  it("writes back without the legacy names and drops the page", () => {
    const p = new URLSearchParams("status=sold&page=3&sort=title&view=cards");
    applyFilterState(p, { and: [{ field: "status", op: "is", values: ["sold"] }], or: [{ field: "logline", op: "contains", values: ["a,b"] }] }, fields);
    expect(p.toString()).toBe("sort=title&view=cards&f=status%7Eis%7Esold&or=logline%7Econtains%7Ea%252Cb");
    expect(parseFilterParams({ or: [p.getAll("or")[0]] }, fields).or[0].values).toEqual(["a,b"]);
  });
  it("labels chips with names, not ids", () => {
    expect(conditionLabel({ field: "status", op: "is", values: ["sold"] }, fields)).toBe("Status: Sold");
    expect(conditionLabel({ field: "talent", op: "any", values: ["c1"] }, fields, new Map([["c1", "Mo Marable"]]))).toBe("Talent is any of Mo Marable");
    expect(conditionLabel({ field: "followers", op: "between", values: ["1", "5"] }, fields)).toBe("Followers 1 – 5");
    expect(conditionLabel({ field: "format", op: "empty", values: [] }, fields)).toBe("Format is empty");
    expect(serializeCondition({ field: "logline", op: "contains", values: ["a,b"] })).toBe("logline~contains~a%2Cb");
  });
});

describe("filter → where", () => {
  it("maps columns, arrays, relations and custom builders", () => {
    expect(conditionWhere({ column: "status" }, { field: "status", op: "any", values: ["a", "b"] })).toEqual({ status: { in: ["a", "b"] } });
    expect(conditionWhere({ column: "status" }, { field: "status", op: "empty", values: [] })).toEqual({ OR: [{ status: null }, { status: "" }] });
    expect(conditionWhere({ column: "types", kind: "array" }, { field: "t", op: "none", values: ["brand"] })).toEqual({ NOT: { types: { hasSome: ["brand"] } } });
    expect(conditionWhere({ column: "premiereYear", kind: "number" }, { field: "y", op: "between", values: ["2020", "2024"] })).toEqual({ premiereYear: { gte: 2020, lte: 2024 } });
    expect(conditionWhere({ column: "premiereYear", kind: "number" }, { field: "y", op: "gt", values: ["x"] })).toBeNull();
    expect(conditionWhere({ relation: "credits", idField: "creatorId" }, { field: "t", op: "any", values: ["c1"] })).toEqual({ credits: { some: { creatorId: { in: ["c1"] } } } });
    expect(conditionWhere({ relation: "people", idField: "personId", extra: { current: true } }, { field: "r", op: "empty", values: [] })).toEqual({ people: { none: { current: true } } });
    expect(conditionWhere({ custom: (c) => ({ socialProfiles: { some: { followerCount: { gte: Number(c.values[0]) } } } }) }, { field: "f", op: "gt", values: ["1000"] })).toEqual({ socialProfiles: { some: { followerCount: { gte: 1000 } } } });
    const w = filterWhere({ status: { column: "status" }, talent: { relation: "credits", idField: "creatorId" } }, { and: [{ field: "status", op: "is", values: ["sold"] }], or: [{ field: "talent", op: "any", values: ["c1"] }, { field: "status", op: "is", values: ["idea"] }] });
    expect(w).toEqual([{ status: "sold" }, { OR: [{ credits: { some: { creatorId: { in: ["c1"] } } } }, { status: "idea" }] }]);
  });
});
