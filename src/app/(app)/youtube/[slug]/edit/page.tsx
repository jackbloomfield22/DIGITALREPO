import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ChannelForm } from "@/components/channel-form";

export const metadata = { title: "Edit Channel" };

export default async function EditChannelPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireRole("EDITOR");
  const { slug } = await params;
  const [channel, talent] = await Promise.all([
    db.channel.findUnique({ where: { slug } }),
    db.creator.findMany({ where: { archived: false }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!channel) notFound();

  return (
    <div>
      <h1 className="mb-6 font-display text-3xl font-bold tracking-tight">EDIT {channel.name.toUpperCase()}</h1>
      <ChannelForm
        talent={talent}
        initial={{
          id: channel.id,
          version: channel.version,
          name: channel.name,
          handle: channel.handle,
          url: channel.url,
          status: channel.status,
          creatorId: channel.creatorId,
          premise: channel.premise,
          cadence: channel.cadence,
          revenueModel: channel.revenueModel,
          notes: channel.notes,
          subscribers: channel.subscribers,
          totalViews: channel.totalViews,
          videoCount: channel.videoCount,
          launchedAt: channel.launchedAt ? channel.launchedAt.toISOString().slice(0, 10) : null,
        }}
      />
    </div>
  );
}
