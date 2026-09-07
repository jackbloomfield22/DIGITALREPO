import Link from "next/link";
import { CaptureBar } from "@/components/hq/capture-bar";

// HQ's own frame: one line of tabs and the capture bar, on every HQ page.
// The section is one thing with views, not seven small apps.

export const HQ_TABS = [
  { href: "/hq", label: "Today" },
  { href: "/hq/pipeline", label: "Pipeline" },
  { href: "/hq/people", label: "People" },
  { href: "/hq/brain", label: "Brain" },
  { href: "/hq/ideas", label: "Ideas" },
  { href: "/hq/studio", label: "Studio" },
  { href: "/hq/calendar", label: "Calendar" },
  { href: "/hq/review", label: "Review" },
  { href: "/hq/settings", label: "Settings" },
] as const;

export function HqFrame({ active, children }: { active: string; children: React.ReactNode }) {
  return (
    <div className="hq">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-baseline gap-3">
          <Link href="/hq" className="font-display text-2xl font-bold tracking-tight">HQ</Link>
          <nav className="flex flex-wrap items-center gap-0.5" aria-label="HQ">
            {HQ_TABS.map((t) => {
              const on = t.href === "/hq" ? active === "/hq" : active.startsWith(t.href);
              return (
                <Link key={t.href} href={t.href} className={`rounded px-2.5 py-1 text-sm ${on ? "bg-ink text-paper" : "text-muted hover:text-accent-deep"}`}>
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <span className="text-xs text-faint">Only you can see this section.</span>
      </div>
      <CaptureBar />
      {children}
    </div>
  );
}
