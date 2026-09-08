import "server-only";

// HQ belongs to one person. The guard is by email, not by role: an admin is
// not the owner, and the owner stays the owner if their role ever changes.
// Everything under /hq, every HQ action and every HQ API route goes through
// requireOwner(); anyone else gets a 404, so the section does not exist for
// them rather than being merely locked.

import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import type { SessionUser } from "@/lib/roles";

export const OWNER_EMAIL = (process.env.HQ_OWNER_EMAIL ?? "jack.bloomfield@44fortymedia.com").toLowerCase();

export function isOwner(user: SessionUser | null | undefined): boolean {
  return !!user && user.email.toLowerCase() === OWNER_EMAIL;
}

/** The owner, or a 404 — never a 403, so the page's existence is not confirmed. */
export async function requireOwner(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!isOwner(user)) notFound();
  return user!;
}

/** For API routes, which answer in JSON rather than rendering a 404 page. */
export async function ownerOrNull(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return isOwner(user) ? user : null;
}
