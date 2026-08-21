import { redirect } from "next/navigation";
import { requireUser, hasRole } from "@/lib/auth";
import { CreatorForm } from "@/components/creators/creator-form";

export const metadata = { title: "New Creator" };

export default async function NewCreatorPage() {
  const user = await requireUser();
  if (!hasRole(user, "EDITOR")) redirect("/creators");
  return <CreatorForm />;
}
