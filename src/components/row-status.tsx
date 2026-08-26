"use client";

// Status and archiving, done from the row. Most edits to a project or a format
// are one word — it moved from developing to on hold, or it's finished and
// should stop crowding the live list. Opening the record, opening its edit
// form, saving, and coming back was the long way round for that, so the pill
// in the list is the control.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusPill } from "@/components/ui";
import { useToast } from "@/components/toast";
import { labelFor } from "@/lib/taxonomy";
import { statusOptionsFor, type ArchiveType, type StatusType } from "@/lib/row-status";
import { archiveRecord, restoreRecord, setRecordStatus } from "@/lib/actions/quick-edit";

const ARCHIVE = "__archive__";

/**
 * The status pill, made editable in place. Read-only for anyone without edit
 * rights, so the list looks the same to everyone and only acts for editors.
 */
export function RowStatus({
  type,
  id,
  status,
  name,
  canEdit,
  archivable = true,
}: {
  type: StatusType;
  id: string;
  status: string;
  name: string;
  canEdit: boolean;
  archivable?: boolean;
}) {
  const [current, setCurrent] = useState(status);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  if (!canEdit) return <StatusPill status={current} label={labelFor(current)} />;

  const change = (value: string) => {
    if (value === current) return;
    if (value === ARCHIVE) {
      if (!window.confirm(`Move "${name}" to the Archive? It leaves the live list but keeps everything — you can bring it back any time.`)) return;
      start(async () => {
        const res = await archiveRecord(type, id);
        if (!res.ok) return toast(res.error ?? "Could not archive that.", { tone: "error" });
        toast(`${name} moved to the Archive`);
        router.refresh();
      });
      return;
    }
    const previous = current;
    setCurrent(value); // the pill changes colour immediately; the server catches up
    start(async () => {
      const res = await setRecordStatus(type, id, value);
      if (!res.ok) {
        setCurrent(previous);
        return toast(res.error ?? "Could not change that status.", { tone: "error" });
      }
      toast(`${name} → ${labelFor(value)}`);
      router.refresh();
    });
  };

  return (
    <span className={`relative inline-flex items-center ${pending ? "opacity-50" : ""}`}>
      <StatusPill status={current} label={labelFor(current)} />
      <span aria-hidden className="ml-0.5 text-[9px] text-faint">▾</span>
      <select
        aria-label={`Status for ${name}`}
        className="absolute inset-0 cursor-pointer opacity-0"
        value={current}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        onClick={(e) => e.stopPropagation()}
      >
        {statusOptionsFor(type).map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
        {/* A status the record already has but the picker normally hides. */}
        {!statusOptionsFor(type).some((s) => s.value === current) && (
          <option value={current}>{labelFor(current)}</option>
        )}
        {archivable && <option value={ARCHIVE}>→ Move to Archive</option>}
      </select>
    </span>
  );
}

/** Archive on its own, for records that have no status of their own. */
export function RowArchive({
  type,
  id,
  name,
  canEdit,
}: {
  type: ArchiveType;
  id: string;
  name: string;
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  if (!canEdit) return null;

  return (
    <button
      type="button"
      className="text-xs text-faint hover:text-accent"
      disabled={pending}
      title={`Move ${name} to the Archive`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!window.confirm(`Move "${name}" to the Archive? It leaves the live list but keeps everything — you can bring it back any time.`)) return;
        start(async () => {
          const res = await archiveRecord(type, id);
          if (!res.ok) return toast(res.error ?? "Could not archive that.", { tone: "error" });
          toast(`${name} moved to the Archive`);
          router.refresh();
        });
      }}
    >
      {pending ? "Archiving…" : "Archive"}
    </button>
  );
}

/** The other direction: out of the Archive and back into the live lists. */
export function RowRestore({
  type,
  id,
  name,
  canEdit,
}: {
  type: ArchiveType;
  id: string;
  name: string;
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  if (!canEdit) return <span className="text-xs text-faint">Editors can restore</span>;

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await restoreRecord(type, id);
          if (!res.ok) return toast(res.error ?? "Could not restore that.", { tone: "error" });
          toast(`${name} is back in the Repo`);
          router.refresh();
        })
      }
    >
      {pending ? "Restoring…" : "Restore"}
    </button>
  );
}
