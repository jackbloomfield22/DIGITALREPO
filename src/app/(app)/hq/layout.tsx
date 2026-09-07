import { requireOwner } from "@/lib/hq/owner";

// Everything under /hq: the owner or a 404. Pages add the frame themselves so
// each can say which tab is active.
export default async function HqLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return <>{children}</>;
}
