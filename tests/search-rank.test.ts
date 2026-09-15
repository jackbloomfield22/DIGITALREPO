// The search ladder: exact, starts-with, word-starts-with, contains, acronym,
// fuzzy — then trigram-only and relationship-only matches after.

import { describe, it, expect } from "vitest";
import { rankCandidates, spellingSuggestion } from "@/lib/search-rank";

const c = (key: string, name: string, extra: Partial<{ aliases: string[]; sim: number; related: boolean }> = {}) => ({ key, name, ...extra });

describe("rankCandidates", () => {
  it("orders by the ladder, keeping everything", () => {
    const items = [
      c("contains", "Bookkeep Upgrade"), c("fuzzy", "Kep Upp"), c("exact", "Keep Up"), c("starts", "Keep Up Brazil"),
      c("word", "Women's Keep Up"), c("related", "Nike Deal Doc", { related: true }), c("trigram", "Kepp Upp", { sim: 0.6 }),
    ];
    const out = rankCandidates(items, "keep up").map((x) => x.key);
    expect(out.slice(0, 3)).toEqual(["exact", "starts", "word"]);
    expect(out.indexOf("contains")).toBeLessThan(out.indexOf("fuzzy"));
    expect(out).toHaveLength(items.length);
    expect(out.at(-1)).toBe("related");
  });
  it("finds records through aliases and ignores accents and punctuation", () => {
    const items = [c("a", "Ashton Jeanty"), c("b", "Brennan Scarlett", { aliases: ["Bren Scarlett", "B. Scarlett"] }), c("c", "José Álvarez")];
    expect(rankCandidates(items, "bren")[0].key).toBe("b");
    expect(rankCandidates(items, "jose alvarez")[0].key).toBe("c");
    expect(rankCandidates(items, "AJ")[0].key).toBe("a");
  });
  it("puts trigram-only rows in similarity order", () => {
    const items = [c("x", "Zzz", { sim: 0.3 }), c("y", "Yyy", { sim: 0.9 }), c("z", "Www", { sim: 0.5 })];
    expect(rankCandidates(items, "qqq").map((x) => x.key)).toEqual(["y", "z", "x"]);
  });
  it("suggests a spelling only when it is different and close", () => {
    expect(spellingSuggestion("brenan scarlet", { name: "Brennan Scarlett", sim: 0.7 })).toBe("Brennan Scarlett");
    expect(spellingSuggestion("Brennan Scarlett", { name: "Brennan Scarlett", sim: 1 })).toBeNull();
    expect(spellingSuggestion("xyz", { name: "Something", sim: 0.2 })).toBeNull();
    expect(spellingSuggestion("xyz", null)).toBeNull();
  });
});
