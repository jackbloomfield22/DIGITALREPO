"use client";

// Hands the option rows the layout loaded to the client-side cache, so every
// picker in the browser shows the same lists as the server rendered.

import { useMemo, type ReactNode } from "react";
import { setOptionCache, type OptionRow } from "@/lib/option-cache";

export function OptionsProvider({ rows, children }: { rows: OptionRow[]; children: ReactNode }) {
  // Not state: the cache is a module variable read synchronously by pickers.
  useMemo(() => setOptionCache(rows), [rows]);
  return <>{children}</>;
}
