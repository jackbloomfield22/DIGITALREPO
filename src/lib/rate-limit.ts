import "server-only";
import { headers } from "next/headers";

// Small in-memory fixed-window rate limiter for auth endpoints. Serverless
// instances each keep their own window, so this is best-effort — enough to
// stop naive credential stuffing without any infrastructure.

const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || entry.resetAt < now) {
    if (windows.size > 10_000) windows.clear();
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= max;
}

/** Best-effort client IP for rate-limit keys (Vercel sets x-forwarded-for). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}
