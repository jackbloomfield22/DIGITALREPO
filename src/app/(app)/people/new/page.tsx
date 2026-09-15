import { redirect } from "next/navigation";
import { requireUser, hasRole } from "@/lib/auth";
import { RecordForm } from "@/components/record-form";
import { PERSON_FIELDS } from "@/lib/form-fields";

export const metadata = { title: "New Industry Person" };

export default async function NewPersonPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const name = ((await searchParams).name ?? "").toString().trim().slice(0, 300);
  const user = await requireUser();
  if (!hasRole(user, "EDITOR")) redirect("/people");
  return <RecordForm kind="person" heading="New Industry Person" fields={PERSON_FIELDS} prefill={name ? { name: name } : undefined} />;
}
