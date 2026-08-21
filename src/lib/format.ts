/** 24 800 000 -> "24.8M", 1 200 -> "1.2K" */
export function compactNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `${trim(n / 1_000_000_000)}B`;
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trim(n / 1_000)}K`;
  return String(n);
}

function trim(v: number): string {
  const s = v.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function relativeTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** True when a verification timestamp is missing or older than `days`. */
export function isStale(date: Date | null | undefined, days: number): boolean {
  if (!date) return true;
  return Date.now() - date.getTime() > days * 86_400_000;
}

export function ageFrom(birthday: Date | null, fallbackAge: number | null): number | null {
  if (birthday) {
    const now = new Date();
    let age = now.getFullYear() - birthday.getFullYear();
    const m = now.getMonth() - birthday.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birthday.getDate())) age--;
    return age;
  }
  return fallbackAge;
}

export function totalAudience(
  profiles: { followerCount: number | null }[],
): number {
  return profiles.reduce((sum, p) => sum + (p.followerCount ?? 0), 0);
}
