import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { RecordForm } from "@/components/record-form";
import { OPPORTUNITY_FIELDS } from "@/lib/form-fields";

export const metadata = { title: "Edit Opportunity" };

export default async function EditOpportunityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  if (!hasRole(user, "EDITOR")) redirect(`/opportunities/${slug}`);
  const opp = await db.opportunity.findUnique({ where: { slug } });
  if (!opp) notFound();

  return (
    <RecordForm
      kind="opportunity"
      heading={`Editing ${opp.title}`}
      fields={OPPORTUNITY_FIELDS}
      initial={{
        id: opp.id,
        slug: opp.slug,
        version: opp.version,
        values: {
          title: opp.title,
          type: opp.type ?? "",
          status: opp.status,
          description: opp.description ?? "",
          audienceRequirements: opp.audienceRequirements ?? "",
          platformRequirements: opp.platformRequirements ?? "",
          deadline: opp.deadline?.toISOString().slice(0, 10) ?? "",
          outcome: opp.outcome ?? "",
          notes: opp.notes ?? "",
        },
      }}
    />
  );
}
