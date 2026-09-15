// The tab strip under a record header. Tabs are links — the current one lives
// in the URL — so a tab survives a refresh and can be shared.

import Link from "next/link";

export type RecordTab = { key: string; label: string; count?: number };

export function RecordTabs({ path, tabs, current }: { path: string; tabs: RecordTab[]; current: string }) {
  return (
    <nav aria-label="Record sections" className="mb-5 -mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
      {tabs.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.key === "overview" ? path : `${path}?tab=${t.key}`}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${active ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:border-line hover:text-ink"}`}
          >
            {t.label}
            {t.count != null && <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-ink text-paper" : "bg-wash text-muted"}`}>{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Which tab a record page shows, from its search params. */
export function currentTab(params: { tab?: string } | undefined, tabs: RecordTab[]): string {
  const wanted = params?.tab ?? "overview";
  return tabs.some((t) => t.key === wanted) ? wanted : "overview";
}
