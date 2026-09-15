"use client";

// The signed-in person's preferences, loaded once by the layout and kept in
// React state; every change is applied at once and written back behind it.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { savePrefs } from "@/lib/actions/prefs";
import type { UserPrefs, Density, ColumnPrefs } from "@/lib/prefs";

type Ctx = {
  prefs: UserPrefs;
  density: Density;
  setDensity: (d: Density) => void;
  layoutFor: (section: string) => "table" | "cards" | undefined;
  setLayout: (section: string, layout: "table" | "cards") => void;
  columnsFor: (view: string) => ColumnPrefs;
  setColumns: (view: string, patch: ColumnPrefs) => void;
  update: (patch: UserPrefs) => void;
};

const PrefsContext = createContext<Ctx | null>(null);

export function PrefsProvider({ initial, children }: { initial: UserPrefs; children: ReactNode }) {
  const [prefs, setPrefs] = useState<UserPrefs>(initial);
  const update = useCallback((patch: UserPrefs) => {
    setPrefs((p) => ({
      ...p,
      ...patch,
      layout: { ...(p.layout ?? {}), ...(patch.layout ?? {}) },
      columns: { ...(p.columns ?? {}), ...(patch.columns ?? {}) },
      filtersOpen: { ...(p.filtersOpen ?? {}), ...(patch.filtersOpen ?? {}) },
    }));
    void savePrefs(patch).catch(() => { /* the next change carries it */ });
  }, []);
  const value = useMemo<Ctx>(() => ({
    prefs,
    density: prefs.density ?? "regular",
    setDensity: (density) => update({ density }),
    layoutFor: (section) => prefs.layout?.[section],
    setLayout: (section, layout) => update({ layout: { [section]: layout } }),
    columnsFor: (view) => prefs.columns?.[view] ?? {},
    setColumns: (view, patch) => update({ columns: { [view]: { ...(prefs.columns?.[view] ?? {}), ...patch } } }),
    update,
  }), [prefs, update]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

const FALLBACK: Ctx = {
  prefs: {}, density: "regular", setDensity: () => {}, layoutFor: () => undefined, setLayout: () => {},
  columnsFor: () => ({}), setColumns: () => {}, update: () => {},
};

export function usePrefs(): Ctx {
  return useContext(PrefsContext) ?? FALLBACK;
}
