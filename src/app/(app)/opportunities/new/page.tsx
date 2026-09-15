import { redirect } from "next/navigation";
import { requireUser, hasRole } from "@/lib/auth";
import { RecordForm } from "@/components/record-form";
import { OPPORTUNITY_FIELDS } from "@/lib/form-fields";

export const metadata = { title: "New Opportunity" };

export default async function NewOpportunityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const name = ((await searchParams).name ?? "").toString().trim().slice(0, 300);
  const user = await requireUser();
  if (!hasRole(user, "EDITOR")) redirect("/opportunities");
  return <RecordForm kind="opportunity" heading="New Opportunity" fields={OPPORTUNITY_FIELDS} prefill={name ? { title: name } : undefined} />;
}
