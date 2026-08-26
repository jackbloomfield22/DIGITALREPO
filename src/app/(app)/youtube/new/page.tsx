import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ChannelForm } from "@/components/channel-form";

export const metadata = { title: "Add Channel" };

export default async function NewChannelPage() {
  await requireRole("EDITOR");
  const talent = await db.creator.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div>
      <h1 className="mb-1 font-display text-3xl font-bold tracking-tight">ADD CHANNEL</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        A channel usually starts as a name on a list of people we&apos;d like to work with,
        so only the name is required. Everything else fills in as it becomes real.
      </p>
      <ChannelForm talent={talent} />
    </div>
  );
}
