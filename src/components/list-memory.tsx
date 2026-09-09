"use client";

// Remembers the order of records on whatever list you last looked at, so a
// record page can step to the previous or next one in that same order. It
// reads the links on the page (any list: a directory, search results, a
// collection, the home page) and keeps them per record type in this tab's
// session storage. Nothing leaves the browser.

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { PAGE_LINKS, isNavActive } from "@/lib/navigation";
import { RECORD_PATHS, recordTypeOf, type SteppableType } from "@/lib/record-paths";

const KEY = "44forty:lists";
type Stored = Partial<Record<SteppableType, { label: string; items: { href: string; name: string }[] }>>;

function readAll(): Stored {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Stored; } catch { return {}; }
}

function scan(label: string) {
  const root = document.getElementById("main-content");
  if (!root) return;
  const found: Stored = {};
  for (const a of Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href^='/']"))) {
    const href = a.getAttribute("href")?.split(/[?#]/)[0] ?? "";
    const type = recordTypeOf(href);
    if (!type) continue;
    const bucket = (found[type] ??= { label, items: [] });
    if (bucket.items.some((x) => x.href === href)) continue;
    const heading = a.querySelector("h1,h2,h3,h4,.font-medium,.font-semibold");
    const name = (heading?.textContent ?? a.textContent ?? "").trim().split("\n")[0].slice(0, 80);
    bucket.items.push({ href, name: name || href.slice(RECORD_PATHS[type].length + 1) });
  }
  if (!Object.keys(found).length) return;
  try {
    const all = readAll();
    for (const [t, v] of Object.entries(found)) if (v && v.items.length > 1) all[t as SteppableType] = v;
    sessionStorage.setItem(KEY, JSON.stringify(all));
    window.dispatchEvent(new Event("44forty:lists"));
  } catch { /* storage unavailable: stepping falls back to alphabetical */ }
}

export function ListMemory() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  useEffect(() => {
    if (recordTypeOf(pathname) || pathname.startsWith("/hq")) return;
    const page = [...PAGE_LINKS].sort((a, b) => b.href.length - a.href.length).find((p) => isNavActive(pathname, p.href));
    const label = pathname === "/" ? "home" : (page?.label ?? "results").toLowerCase();
    const root = document.getElementById("main-content");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => { clearTimeout(timer); timer = setTimeout(() => scan(label), 150); };
    run();
    // Lists that stream in after the shell, or re-sort in place, get picked up too.
    const observer = root ? new MutationObserver(run) : null;
    observer?.observe(root!, { childList: true, subtree: true });
    return () => { clearTimeout(timer); observer?.disconnect(); };
  }, [pathname, query]);
  return null;
}

const subscribe = (cb: () => void) => { window.addEventListener("44forty:lists", cb); window.addEventListener("storage", cb); return () => { window.removeEventListener("44forty:lists", cb); window.removeEventListener("storage", cb); }; };
let cache: { raw: string | null; parsed: Stored } = { raw: null, parsed: {} };
function snapshot(): Stored {
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(KEY); } catch { raw = null; }
  if (raw !== cache.raw) cache = { raw, parsed: raw ? (JSON.parse(raw) as Stored) : {} };
  return cache.parsed;
}
const EMPTY: Stored = {};

/** The remembered list for one record type, or undefined. Stable across renders until the memory changes. */
export function useListMemory(type: SteppableType) {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY)[type];
}
