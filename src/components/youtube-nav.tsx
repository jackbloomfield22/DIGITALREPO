import Link from "next/link";

// The mini-repo's own navigation. YouTube is a business with its own talent,
// its own partners and its own production queue, so it gets sections the way
// the Repo does rather than being one list with filters on top.

export const YOUTUBE_TABS = [
  { href: "/youtube", label: "Overview" },
  { href: "/youtube/channels", label: "Channels" },
  { href: "/youtube/ideas", label: "Ideas" },
  { href: "/youtube/talent", label: "Talent" },
  { href: "/youtube/partners", label: "Partners" },
  { href: "/youtube/playbook", label: "Playbook" },
] as const;

export function YouTubeNav({ active }: { active: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-1 border-b border-line pb-2">
      {YOUTUBE_TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`rounded px-2.5 py-1 text-sm ${
            active === t.href
              ? "bg-wash font-semibold text-charcoal"
              : "text-muted hover:text-accent-deep"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function YouTubeHeader({ active, action }: { active: string; action?: React.ReactNode }) {
  return (
    <>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tight">YOUTUBE</h1>
        {action}
      </div>
      <p className="mb-4 max-w-2xl text-sm text-muted">
        The athlete channels business, kept as its own knowledge base — the channels, the
        production queue behind them, the talent they run on, and the companies and people
        involved.
      </p>
      <YouTubeNav active={active} />
    </>
  );
}
