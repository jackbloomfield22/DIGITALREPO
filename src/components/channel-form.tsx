"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { CHANNEL_STATUSES } from "@/lib/taxonomy";
import { createChannel, updateChannel, type ChannelInput } from "@/lib/actions/channels";

// One form for adding a channel and for editing one. Only the name is
// required — a channel usually enters the Repo as a name on a list of people
// we'd like to work with, long before it has a handle or a subscriber count.

export type ChannelFormValues = ChannelInput & { id?: string; version?: number };

export function ChannelForm({
  initial,
  talent,
}: {
  initial?: ChannelFormValues;
  talent: { id: string; name: string }[];
}) {
  const [values, setValues] = useState<ChannelFormValues>(
    initial ?? { name: "", status: "prospect" },
  );
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const set = (patch: Partial<ChannelFormValues>) => setValues((v) => ({ ...v, ...patch }));

  const submit = async () => {
    if (!values.name.trim() || busy) return;
    setBusy(true);
    const { id, version, ...data } = values;
    const res = id
      ? await updateChannel({ id, expectedVersion: version ?? 1, data })
      : await createChannel(data);
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "Could not save.", { tone: "error" });
    toast(id ? "Channel saved" : `${values.name} added`);
    router.push(`/youtube/${res.slug}`);
    router.refresh();
  };

  return (
    <div className="max-w-2xl space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Channel name</span>
        <input
          type="text"
          value={values.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Tyrese Maxey"
          aria-label="Channel name"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Athlete</span>
          <select
            value={values.creatorId ?? ""}
            onChange={(e) => set({ creatorId: e.target.value || null })}
            aria-label="Athlete"
          >
            <option value="">Not linked yet</option>
            {talent.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Status</span>
          <select
            value={values.status ?? "prospect"}
            onChange={(e) => set({ status: e.target.value })}
            aria-label="Status"
          >
            {CHANNEL_STATUSES.filter((s) => s.value !== "archived").map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Handle</span>
          <input
            type="text"
            value={values.handle ?? ""}
            onChange={(e) => set({ handle: e.target.value })}
            placeholder="@tyresemaxey"
            aria-label="Handle"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Channel URL</span>
          <input
            type="url"
            value={values.url ?? ""}
            onChange={(e) => set({ url: e.target.value })}
            placeholder="https://youtube.com/@…"
            aria-label="Channel URL"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">What the channel is</span>
        <textarea
          rows={3}
          value={values.premise ?? ""}
          onChange={(e) => set({ premise: e.target.value })}
          placeholder="The idea behind it — who it's for and what it makes."
          aria-label="What the channel is"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Subscribers</span>
          <input
            type="number"
            min={0}
            value={values.subscribers ?? ""}
            onChange={(e) => set({ subscribers: e.target.value === "" ? null : Number(e.target.value) })}
            aria-label="Subscribers"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Total views</span>
          <input
            type="number"
            min={0}
            value={values.totalViews ?? ""}
            onChange={(e) => set({ totalViews: e.target.value === "" ? null : Number(e.target.value) })}
            aria-label="Total views"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Videos</span>
          <input
            type="number"
            min={0}
            value={values.videoCount ?? ""}
            onChange={(e) => set({ videoCount: e.target.value === "" ? null : Number(e.target.value) })}
            aria-label="Videos"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Cadence</span>
          <input
            type="text"
            value={values.cadence ?? ""}
            onChange={(e) => set({ cadence: e.target.value })}
            placeholder="2 a week"
            aria-label="Cadence"
          />
        </label>
      </div>
      <p className="-mt-2 text-xs text-faint">
        Changing any of these three stamps today&apos;s date on them, so the list can show
        which numbers have gone stale.
      </p>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Launched</span>
        <input
          type="date"
          className="!w-auto"
          value={values.launchedAt ?? ""}
          onChange={(e) => set({ launchedAt: e.target.value || null })}
          aria-label="Launched"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">How it makes money</span>
        <textarea
          rows={2}
          value={values.revenueModel ?? ""}
          onChange={(e) => set({ revenueModel: e.target.value })}
          placeholder="AdSense split, brand integrations, a sponsor…"
          aria-label="How it makes money"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Notes</span>
        <textarea
          rows={4}
          value={values.notes ?? ""}
          onChange={(e) => set({ notes: e.target.value })}
          aria-label="Notes"
        />
      </label>

      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={!values.name.trim() || busy} onClick={submit}>
          {busy ? "Saving…" : initial?.id ? "Save channel" : "Add channel"}
        </button>
        <button className="btn btn-ghost" onClick={() => router.back()}>Cancel</button>
      </div>
    </div>
  );
}
