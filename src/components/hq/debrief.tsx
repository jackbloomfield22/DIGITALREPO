"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { debriefEvent, skipDebrief } from "@/lib/actions/hq";

// After the meeting: one box. What happened becomes a conversation on each
// person, the card gets its next step, the follow-up is booked.

export function DebriefForm({ eventId, people, hasCard }: { eventId: string; people: { id: string; name: string }[]; hasCard: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [summary, setSummary] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [due, setDue] = useState("");
  const [followUp, setFollowUp] = useState("7");
  const [who, setWho] = useState<string[]>(people.map((p) => p.id));

  return (
    <div className="card p-4">
      <div className="overline mb-2">Debrief</div>
      <textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What happened. What they want. What you promised. What surprised you." className="w-full text-sm" />
      {people.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="text-faint">Log against:</span>
          {people.map((p) => (
            <label key={p.id} className="flex items-center gap-1"><input type="checkbox" className="!w-auto" checked={who.includes(p.id)} onChange={(e) => setWho((w) => (e.target.checked ? [...w, p.id] : w.filter((x) => x !== p.id)))} /> {p.name}</label>
          ))}
        </div>
      )}
      {hasCard && (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_160px]">
          <input value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="Next step on the card (optional)" className="text-sm" />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="text-sm" />
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <select value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="!w-auto text-sm">
          <option value="">No follow-up</option>
          <option value="1">Follow up tomorrow</option>
          <option value="3">Follow up in 3 days</option>
          <option value="7">Follow up in a week</option>
          <option value="14">Follow up in 2 weeks</option>
        </select>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { await skipDebrief(eventId); router.push("/hq"); })}>Nothing to log</button>
          <button className="btn btn-primary btn-sm" disabled={pending || !summary.trim()} onClick={() => start(async () => {
            const r = await debriefEvent({ eventId, summary, nextStep: nextStep || null, nextStepDue: due ? new Date(due + "T12:00:00") : null, followUpInDays: followUp ? Number(followUp) : null, relationshipIds: who });
            if (r.ok) router.push("/hq");
          })}>{pending ? "Saving…" : "Log it"}</button>
        </div>
      </div>
    </div>
  );
}
