"use client";

// Which record the current page is about. Record pages mount <RecordContext>
// once; the breadcrumb, the palette's context actions and the side panel read
// it. A tiny external store rather than context, so the layout (which renders
// before the page) can subscribe without a provider above it.

import { useEffect, useSyncExternalStore } from "react";

export type CurrentRecord = { type: string; id: string; name: string; slug: string; path: string; canEdit: boolean; status?: string | null } | null;

let current: CurrentRecord = null;
const listeners = new Set<() => void>();
const set = (next: CurrentRecord) => { current = next; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function useCurrentRecord(): CurrentRecord {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

export function RecordContext(props: NonNullable<CurrentRecord>) {
  const { type, id, name, slug, path, canEdit, status } = props;
  useEffect(() => {
    set({ type, id, name, slug, path, canEdit, status });
    return () => set(null);
  }, [type, id, name, slug, path, canEdit, status]);
  return null;
}
