import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { RecordForm } from "@/components/record-form";
import { ORGANIZATION_FIELDS } from "@/lib/form-fields";

export const metadata = { title: "Edit Organization" };

export default async function EditOrganizationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  if (!hasRole(user, "EDITOR")) redirect(`/organizations/${slug}`);
  const org = await db.organization.findUnique({ where: { slug } });
  if (!org) notFound();

  return (
    <RecordForm
      kind="organization"
      heading={`Editing ${org.name}`}
      fields={ORGANIZATION_FIELDS}
      initial={{
        id: org.id,
        slug: org.slug,
        version: org.version,
        values: {
          name: org.name,
          types: org.types,
          description: org.description ?? "",
          website: org.website ?? "",
          location: org.location ?? "",
          internalNotes: org.internalNotes ?? "",
        },
      }}
    />
  );
}
