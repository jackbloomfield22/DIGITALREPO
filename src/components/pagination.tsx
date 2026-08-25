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

  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-2 text-sm">
      {page > 1 && (
        <Link className="btn btn-secondary btn-sm" href={linkTo(page - 1)}>
          ← Previous
        </Link>
      )}
      <span className="px-2 text-muted">
        Page {page} of {pages}
      </span>
      {page < pages && (
        <Link className="btn btn-secondary btn-sm" href={linkTo(page + 1)}>
          Next →
        </Link>
      )}
    </nav>
  );
}
