import { redirect } from "next/navigation";
import { requireUser, hasRole } from "@/lib/auth";
import { RecordForm } from "@/components/record-form";
import { PROJECT_FIELDS } from "@/lib/form-fields";

export const metadata = { title: "New Project" };

export default async function NewProjectPage() {
  const user = await requireUser();
  if (!hasRole(user, "EDITOR")) redirect("/projects");
  return <RecordForm kind="project" heading="New Project" fields={PROJECT_FIELDS} />;
}
