import { redirect } from "next/navigation";
import { requireUser, hasRole } from "@/lib/auth";
import { NewCollectionForm } from "@/components/new-collection-form";

export const metadata = { title: "New Collection" };

export default async function NewCollectionPage() {
  const user = await requireUser();
  if (!hasRole(user, "EDITOR")) redirect("/collections");
  return <NewCollectionForm />;
}
