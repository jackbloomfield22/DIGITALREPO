import { redirect } from "next/navigation";
import { requireUser, hasRole } from "@/lib/auth";
import { RecordForm } from "@/components/record-form";
import { OPPORTUNITY_FIELDS } from "@/lib/form-fields";

export const metadata = { title: "New Opportunity" };

export default async function NewOpportunityPage() {
  const user = await requireUser();
  if (!hasRole(user, "EDITOR")) redirect("/opportunities");
  return <RecordForm kind="opportunity" heading="New Opportunity" fields={OPPORTUNITY_FIELDS} />;
}
