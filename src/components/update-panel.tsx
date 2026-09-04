import { hasRole, type SessionUser } from "@/lib/auth";
import { sweepInfo } from "@/lib/sweep";
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
    />
  );
}
