"use client";

// The list view shared by every directory. Column headers are links that set
// `sort` in the URL, so a sorted list survives navigation and can be shared.
// Cells are rendered by the page and handed over as nodes, which keeps the
// table generic without giving up per-directory formatting.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { nextSortValue, type SortState } from "@/lib/directory-sort";

export type TableColumn = {
  label: string;
  /** Omit to make the column unsortable. */
  sortKey?: string;
  align?: "left" | "right";
  /** Tailwind responsive class controlling when the column appears. */
  showAt?: string;
  width?: string;
};

export type TableRow = {
  id: string;
  href: string;
  cells: ReactNode[];
};

export function RecordTable({
  columns,
  rows,
  sort,
  empty = "Nothing here yet.",
}: {
  columns: TableColumn[];
  rows: TableRow[];
  sort: SortState;
  empty?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hrefFor = (column: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", nextSortValue(column, sort));
    params.delete("page");
    return `${pathname}?${params.toString()}`;
  };

  if (!rows.length) {
    return (
      <div className="rounded-md border border-dashed border-line-strong bg-wash/50 px-6 py-10 text-center text-sm text-muted">
        {empty}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-[38rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-wash text-left">
            {columns.map((c) => {
              const active = c.sortKey && sort.key === c.sortKey;
              return (
                <th
                  key={c.label}
                  scope="col"
                  style={c.width ? { width: c.width } : undefined}
                  className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
                    c.align === "right" ? "text-right" : "text-left"
                  } ${c.showAt ?? ""}`}
                  aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}
                >
                  {c.sortKey ? (
                    <Link
                      href={hrefFor(c.sortKey)}
                      scroll={false}
                      className={`inline-flex items-center gap-1 hover:text-accent ${
                        active ? "text-accent" : "text-muted"
                      }`}
                    >
                      {c.label}
                      <span aria-hidden className={active ? "" : "opacity-0 group-hover:opacity-100"}>
                        {active ? (sort.desc ? "↓" : "↑") : "↕"}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-muted">{c.label}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-line last:border-0 hover:bg-wash/60">
              {row.cells.map((cell, i) => {
                const c = columns[i];
                return (
                  <td
                    key={i}
                    className={`px-3 py-2 align-top ${c?.align === "right" ? "text-right" : ""} ${c?.showAt ?? ""}`}
                  >
                    {i === 0 ? (
                      <Link href={row.href} className="font-medium hover:text-accent">
                        {cell}
                      </Link>
                    ) : (
                      cell
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
