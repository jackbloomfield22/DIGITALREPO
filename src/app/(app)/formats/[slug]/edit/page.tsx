import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { RecordForm } from "@/components/record-form";
import { FORMAT_FIELDS } from "@/lib/form-fields";

export const metadata = { title: "Edit Format" };

export default async function EditFormatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  if (!hasRole(user, "EDITOR")) redirect(`/formats/${slug}`);
  const format = await db.format.findUnique({ where: { slug } });
  if (!format) notFound();

  return (
    <RecordForm
      kind="format"
      heading={`Editing ${format.title}`}
      fields={FORMAT_FIELDS}
      initial={{
        id: format.id,
        slug: format.slug,
        version: format.version,
        values: {
          title: format.title,
          formatType: format.formatType ?? "",
          status: format.status,
          logline: format.logline ?? "",
          description: format.description ?? "",
          targetPlatform: format.targetPlatform ?? "",
          episodeLength: format.episodeLength ?? "",
          episodeStructure: format.episodeStructure ?? "",
          productionScale: format.productionScale ?? "",
          location: format.location ?? "",
          sponsorFit: format.sponsorFit ?? "",
          notes: format.notes ?? "",
        },
      }}
    />
  );
}
