import { describe, expect, it } from "vitest";
import { clearDirectoryFilters, directoryPageUrl, pageNumber, nonNegativeNumber, removeFilterValue } from "@/lib/directory-params";
import { allowedNav, isNavActive, PAGE_LINKS, CREATE_ITEMS } from "@/lib/navigation";
import { parseCreatorFilters } from "@/lib/queries/talent";
import { searchWords } from "@/lib/search-where";
import { searchSnippet } from "@/lib/repo-search";

describe("filter URLs", () => {
  it("clears the search and filters while preserving presentation", () => {
    const p = new URLSearchParams("q=basketball&entity=one&entity=two&min=300000&sort=audience&view=cards&page=8");
    clearDirectoryFilters(p);
    expect(p.toString()).toBe("sort=audience&view=cards");
  });
  it("removes only the selected topic from a combined filter", () => {
    const p = new URLSearchParams("entity=basketball&entity=los-angeles&platform=youtube");
    removeFilterValue(p, "entity", "basketball");
    expect(p.getAll("entity")).toEqual(["los-angeles"]);
    expect(p.get("platform")).toBe("youtube");
  });
  it("keeps all filters when correcting an out-of-range page", () => {
    const url = directoryPageUrl("/talent", { q: "A & B", entity: ["one", "two"], page: "999", view: "cards" }, 2);
    const params = new URL(url, "https://example.test").searchParams;
    expect(params.getAll("entity")).toEqual(["one", "two"]);
    expect(params.get("q")).toBe("A & B");
    expect(params.get("page")).toBe("2");
    expect(params.get("view")).toBe("cards");
  });
  it("rejects unsafe pagination and follower values before they reach Prisma", () => {
    for (const value of ["NaN", "Infinity", "-3", "2.5", "not-a-number"]) expect(pageNumber(value)).toBe(1);
    expect(pageNumber(["2", "3"])).toBe(2);
    for (const value of ["NaN", "Infinity", "-3", "999999999999"]) expect(nonNegativeNumber(value)).toBeUndefined();
    expect(nonNegativeNumber("300000")).toBe(300000);
  });
  it("uses the same default talent view as the shared controls", () => {
    expect(parseCreatorFilters({}).view).toBe("table");
    expect(parseCreatorFilters({ view: "cards" }).view).toBe("cards");
  });
});

describe("navigation and search boundaries", () => {
  it("shows editors create actions and keeps HQ and admin routes scoped", () => {
    expect(allowedNav(CREATE_ITEMS, {})).toEqual([]);
    expect(allowedNav(CREATE_ITEMS, { isEditor: true })).toHaveLength(CREATE_ITEMS.length);
    const shared = allowedNav(PAGE_LINKS, {});
    expect(shared.some((p) => p.href === "/hq" || p.href === "/admin")).toBe(false);
  });
  it("does not mark Home or a similar prefix active on every page", () => {
    expect(isNavActive("/talent/someone", "/talent")).toBe(true);
    expect(isNavActive("/talented", "/talent")).toBe(false);
    expect(isNavActive("/talent", "/")).toBe(false);
  });
  it("bounds query complexity and shows a useful plain-text snippet", () => {
    expect(searchWords("   basketball   Nike  basketball ")).toEqual(["basketball", "Nike"]);
    expect(searchWords(Array.from({ length: 30 }, (_, i) => `w${i}`).join(" "))).toHaveLength(12);
    expect(searchSnippet("<p>Basketball &amp; community</p>", "basketball")).toBe("Basketball & community");
  });
});
