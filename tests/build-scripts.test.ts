// The Vercel build runs several tsx scripts in plain Node, outside Next's
// module resolution. Anything those scripts reach must therefore not import
// "server-only", which Next resolves for the app but Node cannot: a single
// such import anywhere in the graph fails the production deploy rather than
// any test. This walks the graph the way Node would and checks it.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

const ROOT = resolve(__dirname, "..");

/** The scripts scripts/vercel-build.mjs runs with tsx, in the order it runs them. */
const BUILD_SCRIPTS = (() => {
  const src = readFileSync(join(ROOT, "scripts/vercel-build.mjs"), "utf8");
  return [...src.matchAll(/run\("npx tsx ([^"\s]+)/g)].map((m) => m[1]);
})();

/** Resolve an import specifier to a file on disk, or null if it is a package. */
function resolveLocal(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && !c.endsWith("/")) {
      try { if (readFileSync(c).length >= 0) return c; } catch { /* a directory */ }
    }
  }
  return null;
}

/** Every module Node would actually load, following value imports only. */
function moduleGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    // `import type { X } from "y"` and `import { type X } from "y"` are erased,
    // so they cannot drag a module into the runtime graph.
    for (const m of src.matchAll(/^\s*import\s+(?!type\s)([^;]*?)from\s*["']([^"']+)["']/gm)) {
      const clause = m[1];
      if (/^\s*\{\s*(type\s)/.test(clause) && !/,/.test(clause)) continue;
      const next = resolveLocal(m[2], file);
      if (next) queue.push(next);
    }
    for (const m of src.matchAll(/^\s*import\s*["']([^"']+)["']/gm)) {
      const next = resolveLocal(m[1], file);
      if (next) queue.push(next);
    }
  }
  return seen;
}

describe("the scripts the production build runs", () => {
  it("finds the scripts in vercel-build.mjs", () => {
    expect(BUILD_SCRIPTS.length).toBeGreaterThan(0);
    for (const s of BUILD_SCRIPTS) expect(existsSync(join(ROOT, s)), `${s} is missing`).toBe(true);
  });

  for (const script of BUILD_SCRIPTS) {
    it(`${script} reaches nothing that imports "server-only"`, () => {
      const graph = moduleGraph(join(ROOT, script));
      const guarded = [...graph].filter((f) => /^\s*import\s+["']server-only["']/m.test(readFileSync(f, "utf8")));
      expect(guarded.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
    });
  }
});
