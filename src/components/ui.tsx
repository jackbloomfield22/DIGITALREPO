import Link from "next/link";
import type { ReactNode } from "react";

/** Interactive relational chip — links into the knowledge graph. */
export function Chip({
  href,
  children,
  title,
}: {
  href?: string;
  children: ReactNode;
  title?: string;
}) {
  if (href) {
    return (
      <Link href={href} className="chip" title={title}>
        {children}
      </Link>
    );
  }
  return <span className="chip">{children}</span>;
}

export function KindBadge({ kind }: { kind: "project" | "format" }) {
  return kind === "project" ? (
    <span className="kind-badge kind-project">Existing Project</span>
  ) : (
    <span className="kind-badge kind-format">4.4.Forty Format</span>
  );
}

export function Section({
  title,
  action,
  children,
  id,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mb-8">
      <div className="mb-2.5 flex items-center justify-between gap-3 border-b border-line pb-1.5">
        <h2 className="overline">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-line-strong bg-wash/50 px-4 py-3 text-sm text-muted">
      <span>{message}</span>
      {action}
    </div>
  );
}

const PALETTES = [
  ["#2c2a25", "#8f3e2a"],
  ["#31383b", "#5e7c6f"],
  ["#3a2f3d", "#8a6d9b"],
  ["#39301f", "#a5813c"],
  ["#22303f", "#5b7fa6"],
  ["#3d2a2a", "#a56458"],
  ["#2a3630", "#4f8567"],
  ["#3b3424", "#948045"],
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Creator/organization imagery. Renders the stored image when present,
 * otherwise an editorial duotone monogram derived from the name.
 */
export function Portrait({
  name,
  imageUrl,
  className = "",
  textClass = "text-3xl",
}: {
  name: string;
  imageUrl?: string | null;
  className?: string;
  textClass?: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name}
        className={`object-cover ${className}`}
      />
    );
  }
  const [bg, fg] = PALETTES[hashCode(name) % PALETTES.length];
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      aria-hidden
      className={`flex items-center justify-center ${className}`}
      style={{
        background: `linear-gradient(145deg, ${bg} 0%, ${bg} 55%, ${fg} 130%)`,
      }}
    >
      <span
        className={`font-display font-semibold tracking-wide ${textClass}`}
        style={{ color: "rgba(250,249,246,0.88)" }}
      >
        {initials}
      </span>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  // formats
  idea: "bg-wash text-muted",
  concept: "bg-wash text-muted",
  developing: "bg-[#eef2ec] text-ok",
  on_hold: "bg-wash text-warn",
  outbound: "bg-[#f5efdd] text-warn",
  pitched: "bg-[#f5efdd] text-warn",
  in_discussion: "bg-[#f5efdd] text-warn",
  sold: "bg-[#eef2ec] text-ok",
  produced: "bg-[#eef2ec] text-ok",
  passed: "bg-wash text-faint",
  archived: "bg-wash text-faint",
  // opportunities
  researching: "bg-wash text-muted",
  active: "bg-[#eef2ec] text-ok",
  completed: "bg-wash text-faint",
  // projects
  announced: "bg-wash text-muted",
  in_production: "bg-[#f5efdd] text-warn",
  airing: "bg-[#eef2ec] text-ok",
  released: "bg-wash text-charcoal",
  ended: "bg-wash text-faint",
  cancelled: "bg-wash text-faint",
  // creators
  watch: "bg-[#f5efdd] text-warn",
  priority: "bg-accent-wash text-accent-deep",
  // ingest
  uploaded: "bg-wash text-muted",
  parsed: "bg-wash text-charcoal",
  triaged: "bg-[#f5efdd] text-warn",
  proposed: "bg-accent-wash text-accent-deep",
  irrelevant: "bg-wash text-faint",
  applied: "bg-[#eef2ec] text-ok",
  failed: "bg-accent-wash text-accent-deep",
  approved: "bg-[#eef2ec] text-ok",
  edited: "bg-[#eef2ec] text-ok",
  rejected: "bg-wash text-faint",
  pending: "bg-[#f5efdd] text-warn",
  superseded: "bg-accent-wash text-accent-deep",
};

export function StatusPill({ status, label }: { status: string; label: string }) {
  const cls = STATUS_COLORS[status] ?? "bg-wash text-muted";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}
