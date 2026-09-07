"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { movePipeline, savePipeline } from "@/lib/actions/hq";
import { BOARD_STAGES, STAGES, hqLabel } from "@/lib/hq/vocab";

export type CardVM = {
  id: string; title: string; stage: string; heat: number; nextStep: string | null; nextStepDue: string | null;
  lastContactAt: string | null; whyItMatters: string | null; targetType: string | null; contacts: { name: string; role: string }[];
  momentum?: { score: number; label: string; why: string };
};

const daysSince = (iso: string | null) => (iso ? Math.floor((new Date().getTime() - new Date(iso).getTime()) / 86_400_000) : null);

function Card({ card, onDrag }: { card: CardVM; onDrag: (id: string) => void }) {
  const since = daysSince(card.lastContactAt);
  const dueSoon = card.nextStepDue ? Math.ceil((new Date(card.nextStepDue).getTime() - new Date().getTime()) / 86_400_000) : null;
  const decision = card.contacts.filter((c) => c.role === "decision_maker" || c.role === "champion");
  return (
    <div
      draggable
      onDragStart={(e) => { onDrag(card.id); e.dataTransfer.effectAllowed = "move"; }}
      className="cursor-grab rounded-md border border-line bg-surface p-2.5 text-sm shadow-[0_1px_0_rgba(0,0,0,0.03)] active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${card.heat === 3 ? "bg-accent" : card.heat === 2 ? "bg-warn" : "bg-faint"}`} title={`heat ${card.heat}`} />
        <Link href={`/hq/pipeline/${card.id}`} className="font-medium leading-snug hover:text-accent">{card.title}</Link>
      </div>
      {card.nextStep ? (
        <div className="mt-1 text-xs text-charcoal">
          → {card.nextStep}
          {dueSoon !== null && <span className={`ml-1 ${dueSoon < 0 ? "text-[#8a3a30] font-medium" : dueSoon <= 2 ? "text-accent-deep" : "text-faint"}`}>{dueSoon < 0 ? `${-dueSoon}d late` : dueSoon === 0 ? "today" : `${dueSoon}d`}</span>}
        </div>
      ) : (
        <div className="mt-1 text-xs text-[#8a3a30]">no next step</div>
      )}
      <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-faint">
        {decision.length > 0 && <span className="text-muted">{decision.map((c) => c.name).join(", ")}</span>}
        <span className={since !== null && since > 14 ? "text-warn" : ""}>{since === null ? "no contact logged" : since === 0 ? "contact today" : `${since}d since contact`}</span>
      </div>
      {card.momentum && (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded bg-wash" title={`Momentum ${card.momentum.score}: ${card.momentum.why}`}>
          <div className={`h-full ${card.momentum.label === "moving" ? "bg-ok" : card.momentum.label === "steady" ? "bg-warn" : card.momentum.label === "stalling" ? "bg-accent" : "bg-faint"}`} style={{ width: `${Math.max(4, card.momentum.score)}%` }} />
        </div>
      )}
    </div>
  );
}

export function PipelineBoard({ cards }: { cards: CardVM[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  const drop = (stage: string) => {
    if (!dragging) return;
    const id = dragging;
    setDragging(null); setOver(null);
    start(async () => { await movePipeline(id, stage); router.refresh(); });
  };
  const add = (stage: string) => {
    const t = title.trim(); if (!t) return;
    start(async () => { await savePipeline({ title: t, stage }); setTitle(""); setAdding(null); router.refresh(); });
  };

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-[1400px] gap-3">
        {BOARD_STAGES.map((stage) => {
          const col = cards.filter((c) => c.stage === stage);
          const spec = STAGES.find((s) => s.value === stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => { e.preventDefault(); if (over !== stage) setOver(stage); }}
              onDragLeave={() => setOver((o) => (o === stage ? null : o))}
              onDrop={() => drop(stage)}
              className={`flex w-[175px] shrink-0 flex-col rounded-md border p-2 transition-colors ${over === stage ? "border-accent bg-accent-wash" : "border-line bg-wash/60"}`}
            >
              <div className="mb-2 flex items-baseline justify-between px-0.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-charcoal" title={spec?.hint}>{hqLabel(STAGES, stage)}</span>
                <span className="text-xs text-faint">{col.length}</span>
              </div>
              <div className="flex-1 space-y-2">
                {col.map((c) => <Card key={c.id} card={c} onDrag={setDragging} />)}
              </div>
              {adding === stage ? (
                <div className="mt-2">
                  <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(stage); if (e.key === "Escape") setAdding(null); }} placeholder="Title…" className="w-full text-sm" />
                  <div className="mt-1 flex gap-1">
                    <button className="btn btn-primary btn-sm" disabled={pending || !title.trim()} onClick={() => add(stage)}>Add</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setAdding(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="mt-2 text-left text-xs text-faint hover:text-accent" onClick={() => { setAdding(stage); setTitle(""); }}>+ Add</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
