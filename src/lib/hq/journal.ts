import "server-only";

// The journal. Every action that changes HQ writes one line here, so the
// week can be read back — and so the review page has something to review.

import { db } from "@/lib/db";

export async function journal(ownerId: string, kind: string, summary: string, target?: { type: string; id: string }): Promise<void> {
  await db.hqActivity.create({ data: { ownerId, kind, summary: summary.slice(0, 500), targetType: target?.type ?? null, targetId: target?.id ?? null } }).catch(() => {});
}
