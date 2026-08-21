import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { aiAvailable } from "@/lib/ai/agent";
import { InboxClient } from "@/components/inbox-client";
import type { Proposal } from "@/lib/ai/inbox";

export const metadata = { title: "Research Inbox" };

export default async function InboxPage() {
  const user = await requireUser();
  const items = await db.researchInboxItem.findMany({
    where: { status: { in: ["pending", "proposed"] } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { createdBy: { select: { name: true } } },
  });
  const recentApplied = await db.researchInboxItem.findMany({
    where: { status: "applied" },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  return (
    <InboxClient
      canEdit={hasRole(user, "EDITOR")}
      available={aiAvailable()}
      items={items.map((i) => ({
        id: i.id,
        rawText: i.rawText,
        status: i.status,
        proposal: (i.proposal as Proposal | null) ?? null,
        createdBy: i.createdBy?.name ?? "—",
        createdAt: i.createdAt.toISOString(),
      }))}
      appliedCount={recentApplied.length}
    />
  );
}
