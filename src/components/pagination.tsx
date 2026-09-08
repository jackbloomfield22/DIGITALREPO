"use client";

// Page links that keep everything else about the view: which mode you're in,
// how it's sorted, what's filtered, what you searched for. Paging used to be
// hand-rolled per directory and two of them dropped the lot, so table view
// silently reverted to cards on page 2.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function Pagination({ page, pages }: { page: number; pages: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (pages <= 1) return null;

  const linkTo = (target: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (target > 1) params.set("page", String(target));
    else params.delete("page");
    const qs = params.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  };

  const visiblePages = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a,b) => a-b);
  return (
    <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-center gap-1 text-sm">
      {page > 1 && <Link className="btn btn-secondary btn-sm min-h-9" href={linkTo(page - 1)}>← Previous</Link>}
      {visiblePages.map((n, index) => <span key={n} className="flex items-center gap-1">
        {index > 0 && n - visiblePages[index - 1] > 1 && <span className="px-1 text-muted" aria-hidden>…</span>}
        <Link href={linkTo(n)} aria-label={`Page ${n}`} aria-current={page === n ? "page" : undefined} className={`flex min-h-9 min-w-9 items-center justify-center rounded-md px-2 ${page === n ? "bg-ink text-paper" : "border border-line bg-surface hover:bg-wash"}`}>{n}</Link>
      </span>)}
      {page < pages && <Link className="btn btn-secondary btn-sm min-h-9" href={linkTo(page + 1)}>Next →</Link>}
      <span className="w-full pt-1 text-center text-xs text-muted">Page {page} of {pages}</span>
    </nav>
  );
}
