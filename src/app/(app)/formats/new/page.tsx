import { redirect } from "next/navigation";
import { requireUser, hasRole } from "@/lib/auth";
import { RecordForm } from "@/components/record-form";
import { FORMAT_FIELDS } from "@/lib/form-fields";

export const metadata = { title: "New Format" };

export default async function NewFormatPage() {
  const user = await requireUser();
  if (!hasRole(user, "EDITOR")) redirect("/formats");
  return <RecordForm kind="format" heading="New Format" fields={FORMAT_FIELDS} />;
}
