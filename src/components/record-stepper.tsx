"use client";

// Previous / next on every record page. The order comes from whichever list
// you were just looking at (remembered by ListMemory in the layout), so
// stepping follows your own sort and filters; if you arrived some other way
// it falls back to alphabetical neighbours worked out on the server. The
// left and right arrow keys step too, unless you are typing.

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useListMemory } from "@/components/list-memory";
import type { SteppableType } from "@/lib/record-paths";

type Neighbor = { href: string; name: string } | null;

export function RecordStepper({ type, fallback }: { type: SteppableType; fallback: { prev: Neighbor; next: Neighbor } }) {
  const pathname = usePathname();
  const router = useRouter();
  const memory = useListMemory(type);
  const { prev, next, position } = useMemo(() => {
    const list = memory?.items ?? [];
    const i = list.findIndex((x) => x.href === pathname);
    if (i < 0) return { prev: fallback.prev, next: fallback.next, position: null as string | null };
    return { prev: list[i - 1] ?? null, next: list[i + 1] ?? null, position: `${i + 1} of ${list.length}${memory?.label ? ` in ${memory.label}` : ""}` };
  }, [memory, pathname, fallback]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft" && prev) router.push(prev.href);
      if (e.key === "ArrowRight" && next) router.push(next.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, router]);

  if (!prev && !next) return null;
  const short = (s: string) => (s.length > 22 ? `${s.slice(0, 21)}…` : s);
  return (
    <nav aria-label="Previous and next" className="no-print flex items-center gap-1 text-xs">
      {prev ? (
        <Link href={prev.href} className="btn btn-secondary btn-sm max-w-[12rem] truncate" title={`Previous: ${prev.name} (← key)`}>‹ {short(prev.name)}</Link>
      ) : (
        <span className="btn btn-secondary btn-sm opacity-40" aria-disabled>‹ Start</span>
      )}
      {position && <span className="hidden px-1 text-faint sm:inline">{position}</span>}
      {next ? (
        <Link href={next.href} className="btn btn-secondary btn-sm max-w-[12rem] truncate" title={`Next: ${next.name} (→ key)`}>{short(next.name)} ›</Link>
      ) : (
        <span className="btn btn-secondary btn-sm opacity-40" aria-disabled>End ›</span>
      )}
    </nav>
  );
}
