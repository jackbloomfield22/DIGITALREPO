"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteInteraction, deleteRelationship, logInteraction, saveRelationship } from "@/lib/actions/hq";
import { AutoDate, AutoSelect, AutoText, TagsField } from "@/components/hq/fields";
import { INTERACTION_KINDS, TIERS, TIER_CADENCE } from "@/lib/hq/vocab";

export type RelationshipVM = {
  id: string; name: string; tier: string; interests: string[]; howWeMet: string | null; notes: string | null; opportunities: string | null;
  email: string | null; lastContactAt: string | null; nextTouchAt: string | null; cadenceDays: number | null;
};

export function RelationshipEditor({ rel }: { rel: RelationshipVM }) {
  const router = useRouter();
  const [, start] = useTransition();
  const save = (patch: Record<string, unknown>) => saveRelationship({ id: rel.id, ...patch }).then(() => router.refresh());
  const cadence = rel.cadenceDays ?? TIER_CADENCE[rel.tier];
  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <AutoSelect label="Circle" value={rel.tier} options={TIERS} onSave={(v) => save({ tier: v })} />
        <div className="grid grid-cols-2 gap-3">
          <AutoDate label="Next touch" value={rel.nextTouchAt} onSave={(v) => save({ nextTouchAt: v })} />
          <label className="block">
            <span className="overline mb-1 block">Every (days)</span>
            <input type="number" min={1} max={365} defaultValue={rel.cadenceDays ?? ""} placeholder={cadence ? `${cadence} by circle` : "—"} className="w-full text-sm"
              onBlur={(e) => { const n = Number(e.target.value); void save({ cadenceDays: n > 0 ? n : null }); }} />
          </label>
        </div>
        <AutoText label="Email" value={rel.email} placeholder="For matching Gmail to this person" onSave={(v) => save({ email: v })} />
        <TagsField label="Interests" value={rel.interests} onSave={(v) => save({ interests: v })} placeholder="golf, sneakers, kids…" />
      </div>
      <AutoText label="How we met" value={rel.howWeMet} placeholder="Where, when, who introduced you." onSave={(v) => save({ howWeMet: v })} />
      <AutoText label="Potential opportunities" value={rel.opportunities} multiline rows={3} placeholder="What could you do together? What do they need?" onSave={(v) => save({ opportunities: v })} />
      <AutoText label="Notes" value={rel.notes} multiline rows={8} placeholder="Everything worth remembering about them." onSave={(v) => save({ notes: v })} />
      <button className="text-xs text-faint hover:text-[#8a3a30]" onClick={() => { if (confirm("Remove this person from HQ? Their Repo record stays.")) start(async () => { await deleteRelationship(rel.id); router.push("/hq/people"); }); }}>
        Remove from HQ
      </button>
    </div>
  );
}

export function InteractionLog({ relationshipId, name, interactions }: { relationshipId: string; name: string; interactions: { id: string; at: string; kind: string; summary: string; source: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState("meeting");
  const [summary, setSummary] = useState("");
  const [followUp, setFollowUp] = useState<string>("");
  const [at, setAt] = useState(new Date().toISOString().slice(0, 10));

  const log = () => {
    const s = summary.trim(); if (!s) return;
    start(async () => {
      await logInteraction({ relationshipId, kind, summary: s, at: new Date(at + "T12:00:00"), followUpInDays: followUp ? Number(followUp) : null });
      setSummary(""); setFollowUp("");
      router.refresh();
    });
  };

  return (
    <div>
      <div className="rounded-md border border-line bg-wash/50 p-3">
        <div className="flex flex-wrap gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="!w-auto text-sm">
            {INTERACTION_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          <input type="date" value={at} onChange={(e) => setAt(e.target.value)} className="!w-auto text-sm" />
          <select value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="!w-auto text-sm" title="Create a follow-up">
            <option value="">No follow-up</option>
            <option value="1">Follow up tomorrow</option>
            <option value="3">Follow up in 3 days</option>
            <option value="7">Follow up in a week</option>
            <option value="14">Follow up in 2 weeks</option>
            <option value="30">Follow up in a month</option>
          </select>
        </div>
        <textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) log(); }} placeholder={`What happened with ${name}? What did they want? What did you promise?`} className="mt-2 w-full text-sm" />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-faint">⌘/Ctrl+Enter to log. Logging moves their last-contact date.</span>
          <button className="btn btn-primary btn-sm" disabled={pending || !summary.trim()} onClick={log}>Log</button>
        </div>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {interactions.length === 0 && <li className="py-2 text-sm text-faint">Nothing logged yet. The first entry is the start of the history.</li>}
        {interactions.map((i) => (
          <li key={i.id} className="group py-2 text-sm">
            <div className="flex items-baseline gap-2 text-xs text-faint">
              <span>{new Date(i.at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
              <span className="uppercase tracking-wide">{i.kind}</span>
              {i.source === "google" && <span>via Gmail</span>}
              <button className="ml-auto opacity-0 hover:text-[#8a3a30] group-hover:opacity-100" onClick={() => start(async () => { await deleteInteraction(i.id); router.refresh(); })} aria-label="Delete">×</button>
            </div>
            <div className="whitespace-pre-wrap">{i.summary}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AddPersonButton() {
  return <Link href="/hq/people?add=1" className="btn btn-primary btn-sm">+ Add person</Link>;
}
