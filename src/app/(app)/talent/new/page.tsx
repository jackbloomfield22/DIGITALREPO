import { redirect } from "next/navigation";
import { requireUser, hasRole } from "@/lib/auth";
import { CreatorForm } from "@/components/talent/creator-form";

export const metadata = { title: "New Talent" };

export default async function NewCreatorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (!hasRole(user, "EDITOR")) redirect("/talent");
  const name = ((await searchParams).name ?? "").toString().trim().slice(0, 300);
  return <CreatorForm initialName={name || undefined} />;
}
