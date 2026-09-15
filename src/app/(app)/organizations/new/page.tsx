import { redirect } from "next/navigation";
import { requireUser, hasRole } from "@/lib/auth";
import { RecordForm } from "@/components/record-form";
import { ORGANIZATION_FIELDS } from "@/lib/form-fields";

export const metadata = { title: "New Organization" };

export default async function NewOrganizationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const name = ((await searchParams).name ?? "").toString().trim().slice(0, 300);
  const user = await requireUser();
  if (!hasRole(user, "EDITOR")) redirect("/organizations");
  return <RecordForm kind="organization" heading="New Organization" fields={ORGANIZATION_FIELDS} prefill={name ? { name: name } : undefined} />;
}
