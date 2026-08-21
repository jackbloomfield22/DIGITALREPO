import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { RecordForm } from "@/components/record-form";
import { PERSON_FIELDS } from "@/lib/form-fields";

export const metadata = { title: "Edit Person" };

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  if (!hasRole(user, "EDITOR")) redirect(`/people/${slug}`);
  const person = await db.industryPerson.findUnique({ where: { slug } });
  if (!person) notFound();

  return (
    <RecordForm
      kind="person"
      heading={`Editing ${person.name}`}
      fields={PERSON_FIELDS}
      initial={{
        id: person.id,
        slug: person.slug,
        version: 0,
        values: {
          name: person.name,
          title: person.title ?? "",
          roleType: person.roleType ?? "",
          notes: person.notes ?? "",
        },
      }}
    />
  );
}
