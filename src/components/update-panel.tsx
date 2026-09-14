import { hasRole, type SessionUser } from "@/lib/auth";
import { sweepInfo } from "@/lib/sweep";
import { db } from "@/lib/db";
import { UpdatePanelClient } from "@/components/update-page";

// Server half of the update panel: works out where the sweep stands for this
// record — when it was last gone over, and which page comes next — and hands
// the client the rest. Every record page places this once, at the top of the
// main column, so the box is in the same place wherever you are.

export async function UpdatePanel({
  user,
  targetType,
  targetId,
  name,
  path,
  recordType,
  workspace,
}: {
  user: SessionUser;
  targetType: string;
  targetId: string;
  name: string;
  path: string;
  recordType: string;
  workspace?: "youtube";
}) {
  if (!hasRole(user, "EDITOR")) return null;
  const info = await sweepInfo(targetType, targetId);
  // The last note typed on this page, if it is still being read or has
  // proposals waiting: the panel picks it up rather than asking again.
  const now = new Date().getTime();
  const last = await db.ingestItem.findFirst({
    where: { kind: "text", metadata: { path: ["page", "id"], equals: targetId }, createdAt: { gt: new Date(now - 24 * 3_600_000) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, createdAt: true, _count: { select: { changes: { where: { status: { in: ["pending", "approved", "edited"] } } } } } },
  });
  const resume =
    last && ["parsed", "triaged"].includes(last.status) && now - last.createdAt.getTime() < 15 * 60_000
      ? { itemId: last.id, state: "working" as const }
      : last && last.status === "proposed" && last._count.changes > 0
        ? { itemId: last.id, state: "ready" as const }
        : null;
  return (
    <UpdatePanelClient
      targetType={targetType}
      targetId={targetId}
      name={name}
      path={path}
      recordType={recordType}
      canEdit
      lastUpdatedAt={info.lastUpdatedAt}
      lastUpdatedBy={info.lastUpdatedBy}
      next={info.next}
      workspace={workspace}
      resume={resume}
    />
  );
}
