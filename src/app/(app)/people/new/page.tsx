import { redirect } from "next/navigation";
import { requireUser, hasRole } from "@/lib/auth";
import { RecordForm } from "@/components/record-form";
import { PERSON_FIELDS } from "@/lib/form-fields";

export const metadata = { title: "New Industry Person" };

export default async function NewPersonPage() {
  const user = await requireUser();
  if (!hasRole(user, "EDITOR")) redirect("/people");
  return <RecordForm kind="person" heading="New Industry Person" fields={PERSON_FIELDS} />;
}
