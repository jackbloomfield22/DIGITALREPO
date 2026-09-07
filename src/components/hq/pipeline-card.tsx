"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deletePipeline, removePipelineContact, savePipeline, setPipelineContact, ensureRelationship } from "@/lib/actions/hq";
import { AutoDate, AutoSelect, AutoText } from "@/components/hq/fields";
import { PersonPicker } from "@/components/hq/pickers";
import { CONTACT_ROLES, HEAT, STAGES, hqLabel } from "@/lib/hq/vocab";

export type CardDetail = {
  id: string; title: string; stage: string; heat: number; whyItMatters: string | null; nextStep: string | null;
  nextStepDue: string | null; lastContactAt: string | null; notes: string | null; targetType: string | null; repoHref: string | null;
  contacts: { relationshipId: string; name: string; role: string; note: string | null; tier: string; lastContactAt: string | null }[];
};

export function PipelineCardEditor({ card }: { card: CardDetail }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [addingRole, setAddingRole] = useState("decision_maker");
  const save = (patch: Record<string, unknown>) => savePipeline({ id: card.id, title: card.title, ...patch }).then(() => router.refresh());

  const addContact = async (pick: { relationshipId?: string; personType?: "person" | "creator"; personId?: string }) => {
    let rid = pick.relationshipId;
    if (!rid && pick.personType && pick.personId) {
      const r = await ensureRelationship(pick.personType, pick.personId);
      if (r.ok) rid = r.id;
    }
    if (!rid) return;
    await setPipelineContact(card.id, rid, addingRole);
    router.refresh();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <AutoText label="Title" value={card.title} onSave={(v) => savePipeline({ id: card.id, title: v || card.title }).then(() => router.refresh())} />
        <AutoText label="Why this matters" value={card.whyItMatters} multiline rows={3} placeholder="The one paragraph you'd say to a buyer, or to yourself in six months." onSave={(v) => save({ whyItMatters: v })} />
        <div className="grid gap-4 sm:grid-cols-[1fr_170px]">
          <AutoText label="Next step" value={card.nextStep} placeholder="The single next thing that moves this." onSave={(v) => save({ nextStep: v })} />
          <AutoDate label="Due" value={card.nextStepDue} onSave={(v) => save({ nextStepDue: v })} />
        </div>
        <AutoText label="Notes" value={card.notes} multiline rows={10} placeholder="Buyer reactions, deal shape, what's been promised, what's been learned." onSave={(v) => save({ notes: v })} />
      </div>

      <div className="space-y-5">
        <div className="card space-y-3 p-4">
          <AutoSelect label="Stage" value={card.stage} options={STAGES} onSave={(v) => save({ stage: v })} />
          <AutoSelect label="Heat" value={String(card.heat)} options={HEAT} onSave={(v) => save({ heat: Number(v) })} />
          <AutoDate label="Last contact" value={card.lastContactAt} onSave={(v) => save({ lastContactAt: v })} />
          {card.repoHref && (
            <div className="text-xs text-muted">
              Linked to the Repo: <Link href={card.repoHref} className="underline hover:text-accent">{hqLabel([{ value: "format", label: "Format" }, { value: "project", label: "Project" }, { value: "channel", label: "Channel" }, { value: "opportunity", label: "Opportunity" }], card.targetType)} page →</Link>
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="overline mb-2">People on this</div>
          {card.contacts.length === 0 && <div className="mb-2 text-sm text-faint">No one attached yet. Decision makers and champions show on the board card.</div>}
          <ul className="mb-3 divide-y divide-line">
            {card.contacts.map((c) => (
              <li key={c.relationshipId} className="flex items-center gap-2 py-1.5 text-sm">
                <div className="min-w-0 flex-1">
                  <Link href={`/hq/people/${c.relationshipId}`} className="font-medium hover:text-accent">{c.name}</Link>
                  <div className="text-xs text-faint">{c.lastContactAt ? `last contact ${new Date(c.lastContactAt).toLocaleDateString()}` : "no contact logged"}</div>
                </div>
                <select value={c.role} className="!w-auto text-xs" onChange={(e) => start(async () => { await setPipelineContact(card.id, c.relationshipId, e.target.value); router.refresh(); })}>
                  {CONTACT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button className="text-xs text-faint hover:text-[#8a3a30]" onClick={() => start(async () => { await removePipelineContact(card.id, c.relationshipId); router.refresh(); })} aria-label="Remove">×</button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <select value={addingRole} onChange={(e) => setAddingRole(e.target.value)} className="!w-auto text-xs">
              {CONTACT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <div className="flex-1"><PersonPicker onPick={addContact} placeholder="Add a person…" /></div>
          </div>
        </div>

        <button
          className="text-xs text-faint hover:text-[#8a3a30]"
          onClick={() => { if (confirm("Delete this card? Tasks and notes stay, unlinked.")) start(async () => { await deletePipeline(card.id); router.push("/hq/pipeline"); }); }}
        >
          Delete card
        </button>
      </div>
    </div>
  );
}
