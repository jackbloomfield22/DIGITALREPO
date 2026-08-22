import { redirect } from "next/navigation";
import { requireUser, hasRole } from "@/lib/auth";
import { CreatorForm } from "@/components/talent/creator-form";

export const metadata = { title: "New Talent" };

export default async function NewCreatorPage() {
  const user = await requireUser();
  if (!hasRole(user, "EDITOR")) redirect("/talent");
  return <CreatorForm />;
}
