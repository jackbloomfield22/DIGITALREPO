"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/** Shared URL state. Rapid changes merge into the latest requested URL; an
 * older response cannot replace newer typing, and Back restores the controls. */
export function useDirectoryQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const serialized = searchParams.toString();
  const source = searchParams.get("q") ?? "";
  const [draft, setDraft] = useState({ observed: serialized, value: source, expected: [] as string[] });
  const [pending, startTransition] = useTransition();
  const paramsRef = useRef(new URLSearchParams(serialized));
  const targets = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSearch = useRef<string | undefined>(undefined);
  const expectedIndex = draft.expected.indexOf(serialized);
  if (draft.observed !== serialized) setDraft({ observed: serialized, value: expectedIndex >= 0 ? draft.value : source, expected: expectedIndex >= 0 ? draft.expected.slice(expectedIndex + 1) : [] });
  const q = draft.observed === serialized || expectedIndex >= 0 ? draft.value : source;

  useEffect(() => {
    const index = targets.current.indexOf(serialized);
    if (index >= 0) {
      targets.current = targets.current.slice(index + 1);
      if (!targets.current.length) paramsRef.current = new URLSearchParams(serialized);
    } else {
      paramsRef.current = new URLSearchParams(serialized);
      targets.current = [];
      pendingSearch.current = undefined;
      if (timer.current) clearTimeout(timer.current);
    }
  }, [serialized]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, [pathname]);

  const update = (mutate: (params: URLSearchParams) => void, replace = false) => {
    if (timer.current) clearTimeout(timer.current);
    const params = new URLSearchParams(paramsRef.current);
    if (pendingSearch.current !== undefined) {
      const value = pendingSearch.current.trim();
      if (value) params.set("q", value); else params.delete("q");
      pendingSearch.current = undefined;
    }
    mutate(params);
    params.delete("page");
    paramsRef.current = params;
    const query = params.toString();
    if (query !== serialized) targets.current.push(query);
    setDraft((prev) => ({ ...prev, value: params.get("q") ?? "", expected: query !== serialized ? [...prev.expected, query] : prev.expected }));
    startTransition(() => router[replace ? "replace" : "push"](`${pathname}${query ? `?${query}` : ""}`, { scroll: false }));
  };
  const onSearch = (value: string) => {
    setDraft((prev) => ({ ...prev, value }));
    pendingSearch.current = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => update(() => {}, true), 300);
  };
  return { q, onSearch, update, searchParams, pending, pathname };
}
