"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { refileCapture } from "@/lib/actions/hq";

// GTD's clarify step, made tiny: what the capture bar filed today, with one
// click to move anything that landed in the wrong place.

const HREF: Record<string, (id: string) => string> = { task: () => "/hq#tasks", idea: (id) => `/hq/ideas/${id}`, note: (id) => `/hq/brain/${id}` };

export function RefileStrip({ items }: { items: { from: "task" | "idea" | "note"; id: string; title: string; as: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const move = (it: (typeof items)[number], to: "task" | "follow_up" | "idea" | "note") =>
    start(async () => { const r = await refileCapture(it.from, it.id, to); if (r.ok) router.refresh(); });
  return (
    <section className="mb-6 rounded-md border border-dashed border-line-strong px-4 py-3">
      <div className="mb-1 flex items-baseline justify-between"><span className="overline">Captured today — filed right?</span><span className="text-xs text-faint">Click to re-file</span></div>
      <ul className="divide-y divide-line text-sm">
        {items.map((it) => (
          <li key={`${it.from}:${it.id}`} className="flex flex-wrap items-center gap-x-3 py-1.5">
            <span className="w-16 shrink-0 text-xs uppercase tracking-wide text-faint">{it.as}</span>
            <Link href={HREF[it.from](it.id)} className="min-w-0 flex-1 truncate hover:text-accent">{it.title}</Link>
            <span className="flex gap-1 text-xs">
              {(["task", "follow_up", "idea", "note"] as const).filter((k) => k.replace("_", "-") !== it.as).map((k) => (
                <button key={k} className="rounded bg-wash px-1.5 py-0.5 text-muted hover:text-accent" disabled={pending} onClick={() => move(it, k)}>→ {k.replace("_", "-")}</button>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
