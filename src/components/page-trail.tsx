"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DIRECTORY_PATHS, PAGE_LINKS, isNavActive } from "@/lib/navigation";

/** Layout state survives a visit to a record and keeps the exact list URL. */
export function PageTrail() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [lastList, setLastList] = useState<{ href: string; label: string } | null>(null);
  const current = [...PAGE_LINKS].sort((a,b) => b.href.length - a.href.length).find((p) => isNavActive(pathname, p.href));
  const query = params.toString();
  const href = `${pathname}${query ? `?${query}` : ""}`;
  if (DIRECTORY_PATHS.includes(pathname) && lastList?.href !== href) setLastList({ href, label: current?.label ?? "results" });
  if (pathname === "/") return null;
  const detail = current && pathname !== current.href;
  return <nav aria-label="Breadcrumb" className="no-print mb-5 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-muted">
    <Link href="/" className="hover:text-accent">Home</Link><span aria-hidden>/</span>
    {detail ? <><Link href={current.href === "/youtube" ? "/youtube/channels" : current.href} className="hover:text-accent">{current.label}</Link><span aria-hidden>/</span><span aria-current="page" className="text-ink">{pathname.endsWith("/new") ? "Add new" : pathname.endsWith("/edit") ? "Edit record" : "Details"}</span></> : <span aria-current="page" className="text-ink">{current?.label ?? "Page"}</span>}
    {detail && lastList && <Link href={lastList.href} className="btn btn-secondary btn-sm sm:ml-auto">← Back to {lastList.label.toLowerCase()}</Link>}
  </nav>;
}
