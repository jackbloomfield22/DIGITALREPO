import Link from "next/link";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/hq/owner";
import { HqFrame } from "@/components/hq/nav";
import { PipelineBoard, type CardVM } from "@/components/hq/pipeline-board";
import { ACTIVE_STAGES } from "@/lib/hq/vocab";

export const metadata = { title: "HQ · Pipeline" };
export const dynamic = "force-dynamic";

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requireOwner();
  const { show } = await searchParams;
  const cards = await db.hqPipeline.findMany({
    where: { ownerId: user.id, ...(show === "all" ? {} : { closedAt: null }) },
    orderBy: [{ order: "asc" }, { heat: "desc" }, { updatedAt: "desc" }],
    include: { contacts: { include: { relationship: { select: { name: true } } } } },
  });
  const vm: CardVM[] = cards.map((c) => ({
    id: c.id, title: c.title, stage: c.stage, heat: c.heat, nextStep: c.nextStep, nextStepDue: c.nextStepDue?.toISOString() ?? null,
    lastContactAt: c.lastContactAt?.toISOString() ?? null, whyItMatters: c.whyItMatters, targetType: c.targetType,
    contacts: c.contacts.map((x) => ({ name: x.relationship.name, role: x.role })),
  }));
  const inPlay = cards.filter((c) => ACTIVE_STAGES.includes(c.stage) && !c.closedAt);
  const hot = inPlay.filter((c) => c.heat === 3).length;
  const noNext = inPlay.filter((c) => !c.nextStep).length;
  const passed = cards.filter((c) => c.stage === "passed").length;

  return (
    <HqFrame active="/hq/pipeline">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted">
            {inPlay.length} in play · {hot} hot · {noNext ? <span className="text-[#8a3a30]">{noNext} with no next step</span> : "every card has a next step"}
            {show === "all" ? ` · ${passed} passed shown` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Link href={show === "all" ? "/hq/pipeline" : "/hq/pipeline?show=all"} className="text-muted hover:text-accent">{show === "all" ? "Hide passed" : "Show passed"}</Link>
          <span className="text-faint">Drag cards between stages. Click a title for the full card.</span>
        </div>
      </div>
      {cards.length === 0 ? (
        <div className="card p-5 text-sm text-muted">
          No cards yet. Add one in any column, promote an idea, or <Link href="/hq/settings" className="underline hover:text-accent">seed from the Repo</Link> to bring in every live format, channel and production.
        </div>
      ) : (
        <PipelineBoard cards={vm.filter((c) => show === "all" || c.stage !== "passed")} />
      )}
    </HqFrame>
  );
}
