import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { CreatorForm } from "@/components/creators/creator-form";

export const metadata = { title: "Edit Creator" };

export default async function EditCreatorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  if (!hasRole(user, "EDITOR")) redirect(`/creators/${slug}`);

  const creator = await db.creator.findUnique({
    where: { slug },
    include: { socialProfiles: true },
  });
  if (!creator) notFound();

  return (
    <CreatorForm
      initial={{
        id: creator.id,
        slug: creator.slug,
        version: creator.version,
        scalars: {
          name: creator.name,
          imageUrl: creator.imageUrl,
          headline: creator.headline,
          status: creator.status,
          age: creator.age,
          birthday: creator.birthday?.toISOString().slice(0, 10) ?? null,
          miniBio: creator.miniBio,
          digitalSummary: creator.digitalSummary,
          opportunityNotes: creator.opportunityNotes,
          internalNotes: creator.internalNotes,
          aliases: creator.aliases,
        },
        socials: creator.socialProfiles.map((s) => ({
          id: s.id,
          platform: s.platform,
          handle: s.handle ?? "",
          url: s.url ?? "",
          followerCount: s.followerCount?.toString() ?? "",
        })),
      }}
    />
  );
}
