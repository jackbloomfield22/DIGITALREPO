"use client";

// One line: Section › Record name. On a record page the name comes from the
// page itself; the "back to list" link remembers the exact list you came
// from, filters and all.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DIRECTORY_PATHS, PAGE_LINKS, isNavActive } from "@/lib/navigation";
import { useCurrentRecord } from "@/components/record-context";

export function PageTrail() {
  const pathname = usePathname();
  const params = useSearchParams();
  const record = useCurrentRecord();
  const [lastList, setLastList] = useState<{ href: string; label: string } | null>(null);
  const current = [...PAGE_LINKS].sort((a, b) => b.href.length - a.href.length).find((p) => isNavActive(pathname, p.href));
  const query = params.toString();
  const href = `${pathname}${query ? `?${query}` : ""}`;
  if (DIRECTORY_PATHS.includes(pathname) && lastList?.href !== href) setLastList({ href, label: current?.label ?? "results" });
  if (pathname === "/" || pathname.startsWith("/hq")) return null;
  const detail = current && pathname !== current.href;
  const leaf = record?.name ?? (pathname.endsWith("/new") ? "New" : pathname.endsWith("/edit") ? "Edit" : "Details");
  return (
    <nav aria-label="Breadcrumb" className="no-print mb-4 flex items-center gap-x-2 text-sm text-muted">
      {detail ? (
        <>
          <Link href={current.href === "/youtube" ? "/youtube/channels" : current.href} className="shrink-0 hover:text-accent">{current.label}</Link>
          <span aria-hidden>›</span>
          <span aria-current="page" className="truncate text-ink">{leaf}</span>
        </>
      ) : (
        <span aria-current="page" className="text-ink">{current?.label ?? "Page"}</span>
      )}
      {detail && lastList && <Link href={lastList.href} className="btn btn-secondary btn-sm ml-auto shrink-0">← Back to {lastList.label.toLowerCase()}</Link>}
    </nav>
  );
}
