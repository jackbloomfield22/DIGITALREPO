"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "@/components/overlay";
import { createEvent, updateEvent, deleteEvent, importStandardCalendar, type EventInput } from "@/lib/actions/events";
import { useToast } from "@/components/toast";

export type EventVM = {
  id: string;
  title: string;
  league: string | null;
  sportName: string | null;
  startDate: string; // yyyy-mm-dd
  endDate: string | null;
  location: string | null;
  notes: string | null;
  approximate: boolean;
};

function EventForm({
  initial,
  onDone,
}: {
  initial?: EventVM;
  onDone: () => void;
}) {
  const [form, setForm] = useState<EventInput>({
    title: initial?.title ?? "",
    league: initial?.league ?? "",
    sportName: initial?.sportName ?? "",
    startDate: initial?.startDate ?? "",
    endDate: initial?.endDate ?? "",
    location: initial?.location ?? "",
    notes: initial?.notes ?? "",
    approximate: initial?.approximate ?? false,
  });
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const set = (patch: Partial<EventInput>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="ev-title">Event *</label>
        <input id="ev-title" type="text" className="mt-1" value={form.title} onChange={(e) => set({ title: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="ev-sport">Sport</label>
          <input id="ev-sport" type="text" className="mt-1" placeholder="e.g. Soccer" value={form.sportName ?? ""} onChange={(e) => set({ sportName: e.target.value })} />
        </div>
        <div>
          <label htmlFor="ev-league">League</label>
          <input id="ev-league" type="text" className="mt-1" placeholder="e.g. NFL" value={form.league ?? ""} onChange={(e) => set({ league: e.target.value })} />
        </div>
        <div>
          <label htmlFor="ev-start">Start *</label>
          <input id="ev-start" type="date" className="mt-1" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        </div>
        <div>
          <label htmlFor="ev-end">End</label>
          <input id="ev-end" type="date" className="mt-1" value={form.endDate ?? ""} onChange={(e) => set({ endDate: e.target.value })} />
        </div>
      </div>
      <div>
        <label htmlFor="ev-location">Location</label>
        <input id="ev-location" type="text" className="mt-1" value={form.location ?? ""} onChange={(e) => set({ location: e.target.value })} />
      </div>
      <div>
        <label htmlFor="ev-notes">Notes</label>
        <textarea id="ev-notes" rows={2} className="mt-1" value={form.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
      </div>
      <label className="flex items-center gap-2 text-sm font-normal">
        <input
          type="checkbox"
          className="!w-auto"
          checked={!!form.approximate}
          onChange={(e) => set({ approximate: e.target.checked })}
        />
        Dates approximate (not officially announced yet)
      </label>
      <div className="flex justify-between gap-2 border-t border-line pt-4">
        {initial ? (
          <button
            className="btn btn-ghost btn-sm text-accent"
            disabled={saving}
            onClick={async () => {
              if (!window.confirm(`Delete “${initial.title}”?`)) return;
              setSaving(true);
              const res = await deleteEvent(initial.id);
              toast(res.ok ? "Event deleted" : (res.error ?? "Failed"), res.ok ? {} : { tone: "error" });
              setSaving(false);
              if (res.ok) {
                onDone();
                router.refresh();
              }
            }}
          >
            Delete
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={onDone}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={saving || !form.title.trim() || !form.startDate}
            onClick={async () => {
              setSaving(true);
              const res = initial ? await updateEvent(initial.id, form) : await createEvent(form);
              toast(res.ok ? (initial ? "Event updated" : "Event added") : (res.error ?? "Failed"), res.ok ? {} : { tone: "error" });
              setSaving(false);
              if (res.ok) {
                onDone();
                router.refresh();
              }
            }}
          >
            {saving ? "Saving…" : initial ? "Save Changes" : "Add Event"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AddEventButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-accent" onClick={() => setOpen(true)}>+ Add Event</button>
      <Drawer open={open} onClose={() => setOpen(false)} title="New Event">
        {open && <EventForm onDone={() => setOpen(false)} />}
      </Drawer>
    </>
  );
}

export function EditEventButton({ event }: { event: EventVM }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="text-xs text-muted underline underline-offset-2 hover:text-accent"
        onClick={() => setOpen(true)}
      >
        Edit
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title={`Edit — ${event.title}`}>
        {open && <EventForm initial={event} onDone={() => setOpen(false)} />}
      </Drawer>
    </>
  );
}

export function ImportCalendarButton({ compact }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  return (
    <button
      className={compact ? "btn btn-secondary btn-sm" : "btn btn-primary"}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await importStandardCalendar();
        toast(
          res.ok
            ? res.added
              ? `Loaded ${res.added} events`
              : "Calendar already up to date"
            : (res.error ?? "Import failed"),
          res.ok ? {} : { tone: "error" },
        );
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? "Loading…" : "Load Standard Sports Calendar"}
    </button>
  );
}
