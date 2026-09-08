// The rules of the two-month timer, in a plain module the pages and the
// client components can read without pulling in server code.

export const QUIET_DAYS = 60;
export const QUIET_FORMAT_STATUSES = ["idea", "concept", "developing"] as const;
export const QUIET_PROJECT_STATUSES = ["announced"] as const;
export const QUIET_REASON = "Went quiet — no update in two months";

export function onQuietTimer(targetType: "format" | "project", status: string): boolean {
  return targetType === "format"
    ? (QUIET_FORMAT_STATUSES as readonly string[]).includes(status)
    : (QUIET_PROJECT_STATUSES as readonly string[]).includes(status);
}

/** Days since the record last moved, and days left before it archives itself. */
export function quietClock(record: { updatedAt: Date; lastActivityAt: Date | null }, now = new Date()): { quietDays: number; daysLeft: number } {
  const last = Math.max(record.updatedAt.getTime(), record.lastActivityAt?.getTime() ?? 0);
  const quietDays = Math.floor((now.getTime() - last) / 86_400_000);
  return { quietDays, daysLeft: Math.max(0, QUIET_DAYS - quietDays) };
}
