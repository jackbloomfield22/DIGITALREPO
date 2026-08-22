"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addLink, removeLink } from "@/lib/actions/links";
import { createEntityInline } from "@/lib/actions/create-inline";
import { useToast } from "@/components/toast";

type TypeOption = { id: string; name: string };

/**
 * Multi-select dropdown for a talent profile's subsections (Creator, Musician,
 * Athlete, ...). Selections autosave; a new type can be added inline.
 */
export function TalentTypeSelect({
  creatorId,
  selected,
  allTypes,
  canEdit,
}: {
  creatorId: string;
  selected: TypeOption[];
  allTypes: TypeOption[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [newType, setNewType] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const selectedIds = new Set(selected.map((s) => s.id));
  const summary = selected.map((s) => s.name).join(" · ") || "Talent";

  if (!canEdit) return <span>{summary}</span>;

  const toggle = async (option: TypeOption, checked: boolean) => {
    setBusy(true);
    const payload = {
      kind: "creator_entity" as const,
      creatorId,
      entityId: option.id,
      relationship: "",
    };
    const res = checked ? await addLink(payload) : await removeLink(payload);
    setBusy(false);
    if (res.ok) {
      toast(checked ? `Added ${option.name}` : `Removed ${option.name}`, {
        undo: async () => {
          await (checked ? removeLink(payload) : addLink(payload));
          router.refresh();
        },
      });
      router.refresh();
    } else toast(res.error, { tone: "error" });
  };

  return (
    <span className="relative inline-flex items-center gap-1">
      <span>{summary}</span>
      <button
        className="rounded border border-line-strong px-1 text-xs text-muted hover:border-accent hover:text-accent-deep"
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Edit talent types"
        onClick={() => setOpen((v) => !v)}
      >
        ▾
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-20" aria-hidden onClick={() => setOpen(false)} />
          <div
            role="listbox"
            aria-label="Talent types"
            className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-line bg-surface p-2 shadow-pop"
          >
            <div className="overline mb-1 px-1">Talent Type</div>
            <div className="max-h-64 overflow-y-auto">
              {allTypes.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm font-normal hover:bg-wash"
                >
                  <input
                    type="checkbox"
                    className="!w-auto"
                    disabled={busy}
                    checked={selectedIds.has(option.id)}
                    onChange={(e) => toggle(option, e.target.checked)}
                  />
                  {option.name}
                </label>
              ))}
            </div>
            <form
              className="mt-1.5 flex gap-1 border-t border-line pt-1.5"
              onSubmit={async (e) => {
                e.preventDefault();
                const name = newType.trim();
                if (!name) return;
                setBusy(true);
                const created = await createEntityInline("creator_category", name);
                if (created.ok) {
                  await toggle({ id: created.id, name: created.name }, true);
                  setNewType("");
                } else toast(created.error, { tone: "error" });
                setBusy(false);
              }}
            >
              <input
                type="text"
                placeholder="Add new type…"
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                aria-label="Add new talent type"
                className="!py-1 text-xs"
              />
              <button type="submit" className="btn btn-secondary btn-sm" disabled={busy || !newType.trim()}>
                Add
              </button>
            </form>
          </div>
        </>
      )}
    </span>
  );
}
