"use client";

// Page links that keep everything else about the view: mode, sort, filters,
// search. Fifty rows a page, with "View all" for lists up to five hundred;
// never infinite scroll.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { VIEW_ALL_CAP } from "@/lib/directory-params";

export function Pagination({ page, pages, total, all }: { page: number; pages: number; total?: number; all?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const linkTo = (mutate: (p: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const qs = params.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  };
  const pageHref = (target: number) => linkTo((p) => { p.delete("all"); if (target > 1) p.set("page", String(target)); else p.delete("page"); });
  if (all) {
    return <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
      <span className="text-xs text-muted">Showing all {Math.min(total ?? 0, VIEW_ALL_CAP).toLocaleString()}{(total ?? 0) > VIEW_ALL_CAP ? ` of ${total?.toLocaleString()}` : ""}</span>
      <Link className="btn btn-secondary btn-sm min-h-9" href={pageHref(1)}>Show pages</Link>
    </nav>;
  }
  if (pages <= 1) return null;
  const visiblePages = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  return (
    <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-center gap-1 text-sm">
      {page > 1 && <Link className="btn btn-secondary btn-sm min-h-9" href={pageHref(page - 1)}>← Previous</Link>}
      {visiblePages.map((n, index) => <span key={n} className="flex items-center gap-1">
        {index > 0 && n - visiblePages[index - 1] > 1 && <span className="px-1 text-muted" aria-hidden>…</span>}
        <Link href={pageHref(n)} aria-label={`Page ${n}`} aria-current={page === n ? "page" : undefined} className={`flex min-h-9 min-w-9 items-center justify-center rounded-md px-2 ${page === n ? "bg-ink text-paper" : "border border-line bg-surface hover:bg-wash"}`}>{n}</Link>
      </span>)}
      {page < pages && <Link className="btn btn-secondary btn-sm min-h-9" href={pageHref(page + 1)}>Next →</Link>}
      <span className="w-full pt-1 text-center text-xs text-muted">
        Page {page} of {pages}
        {total !== undefined && total <= VIEW_ALL_CAP && <> · <Link className="underline hover:text-accent" href={linkTo((p) => { p.delete("page"); p.set("all", "1"); })}>View all {total.toLocaleString()}</Link></>}
      </span>
    </nav>
  );
}
