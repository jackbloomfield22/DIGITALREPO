import "server-only";

// Documents that live in the Repo and are edited in place — the development
// slate above all, which was a Google Doc everyone linked to and nobody could
// read from inside the Repo.

import { db } from "@/lib/db";

export const DEV_SLATE_SLUG = "dev-slate";

/** The document, created empty on first visit rather than by a seed script. */
export async function getOrCreateDoc(slug: string, title: string) {
  const existing = await db.doc.findUnique({ where: { slug } });
  if (existing) return existing;
  return db.doc.create({ data: { slug, title, content: "" } });
}
