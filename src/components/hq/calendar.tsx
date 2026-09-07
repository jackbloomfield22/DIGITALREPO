"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteEvent, importIcs, saveEvent } from "@/lib/actions/hq";
import { CardPicker, PersonPicker } from "@/components/hq/pickers";

export type EventVM = { id: string; title: string; startsAt: string; endsAt: string | null; allDay: boolean; location: string | null; source: string; relationship: { id: string; name: string } | null; pipeline: { id: string; title: string } | null; attendees: string[] };

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export function WeekStrip({ days, events }: { days: string[]; events: EventVM[] }) {
  const today = new Date().toDateString();
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((d) => {
        const date = new Date(d);
        const list = events.filter((e) => new Date(e.startsAt).toDateString() === date.toDateString());
        const isToday = date.toDateString() === today;
        return (
          <div key={d} className={`min-h-[120px] rounded-md border p-1.5 ${isToday ? "border-accent bg-accent-wash/40" : "border-line bg-surface"}`}>
            <div className={`mb-1 text-xs ${isToday ? "font-semibold text-accent-deep" : "text-muted"}`}>{date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</div>
            <ul className="space-y-1">
              {list.map((e) => (
                <li key={e.id} className="truncate rounded bg-wash px-1 py-0.5 text-xs" title={e.title}>
                  {!e.allDay && <span className="text-faint">{fmtTime(e.startsAt)} </span>}{e.title}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function EventList({ events }: { events: EventVM[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  if (!events.length) return <div className="text-sm text-faint">Nothing coming up.</div>;
  return (
    <ul className="divide-y divide-line">
      {events.map((e, i) => {
        const day = new Date(e.startsAt).toDateString();
        const head = i === 0 || new Date(events[i - 1].startsAt).toDateString() !== day;
        return (
          <li key={e.id} className="py-2 text-sm">
            {head && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">{new Date(e.startsAt).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>}
            <div className="flex items-baseline gap-2">
              <span className="w-20 shrink-0 text-muted">{e.allDay ? "all day" : fmtTime(e.startsAt)}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{e.title}</span>
                {e.location && <span className="text-faint"> · {e.location}</span>}
                <span className="block text-xs text-faint">
                  {e.relationship && <Link href={`/hq/people/${e.relationship.id}`} className="hover:text-accent">{e.relationship.name}</Link>}
                  {e.relationship && e.pipeline && " · "}
                  {e.pipeline && <Link href={`/hq/pipeline/${e.pipeline.id}`} className="hover:text-accent">{e.pipeline.title}</Link>}
                  {e.attendees.length > 0 && <span> · {e.attendees.slice(0, 3).join(", ")}{e.attendees.length > 3 ? ` +${e.attendees.length - 3}` : ""}</span>}
                  {e.source !== "manual" && <span> · {e.source === "google" ? "Google" : "imported"}</span>}
                </span>
              </span>
              <button className="text-xs text-faint hover:text-[#8a3a30]" onClick={() => start(async () => { await deleteEvent(e.id); router.refresh(); })} aria-label="Delete">×</button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function AddEvent() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [card, setCard] = useState<{ id: string; title: string } | null>(null);
  const add = () => {
    const t = title.trim(); if (!t) return;
    const startsAt = new Date(`${date}T${time || "09:00"}:00`);
    start(async () => {
      await saveEvent({ title: t, startsAt, endsAt: time ? new Date(startsAt.getTime() + 3600_000) : null, allDay: !time, location: location || null, relationshipId: person?.id ?? null, pipelineId: card?.id ?? null });
      setTitle(""); setTime(""); setLocation(""); setPerson(null); setCard(null); router.refresh();
    });
  };
  return (
    <div className="space-y-2">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What" className="w-full text-sm" />
      <div className="flex gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="text-sm" />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="text-sm" />
      </div>
      <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where (optional)" className="w-full text-sm" />
      {person ? <div className="text-sm">With {person.name} <button className="text-xs text-faint" onClick={() => setPerson(null)}>×</button></div> : <PersonPicker placeholder="With whom (optional)" onPick={(p) => { if (p.relationshipId) setPerson({ id: p.relationshipId, name: p.name }); }} />}
      {card ? <div className="text-sm">About {card.title} <button className="text-xs text-faint" onClick={() => setCard(null)}>×</button></div> : <CardPicker placeholder="About which card (optional)" onPick={setCard} />}
      <button className="btn btn-primary btn-sm w-full" disabled={pending || !title.trim()} onClick={add}>Add to calendar</button>
    </div>
  );
}

export function IcsImport() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <label className={`btn btn-secondary btn-sm cursor-pointer ${busy ? "opacity-60" : ""}`}>
        {busy ? "Importing…" : "Import an .ics file"}
        <input type="file" accept=".ics,text/calendar" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
          setBusy(true);
          const r = await importIcs(await f.text());
          setBusy(false);
          setMsg(r.ok ? `${r.imported} events imported${r.skipped ? `, ${r.skipped} older than 90 days skipped` : ""}.` : r.error);
          router.refresh();
        }} />
      </label>
      <p className="mt-1 text-xs text-faint">Google Calendar → Settings → Export; Apple Calendar → File → Export. Re-importing the same file updates rather than duplicates.</p>
      {msg && <div className="mt-1 text-xs text-muted">{msg}</div>}
    </div>
  );
}
