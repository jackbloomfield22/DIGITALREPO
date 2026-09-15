"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Combobox, lookupItems } from "@/components/combobox";
import { useRouter } from "next/navigation";
import { addLink, removeLink, type LinkPayload } from "@/lib/actions/links";
import {
  createEntityInline,
  createFormatInline,
  createOrganizationInline,
  createPersonInline,
  createProjectInline,
} from "@/lib/actions/create-inline";
import { useToast } from "@/components/toast";
import type { LabeledValue } from "@/lib/taxonomy";

export type ChipItem = {
  key: string;
  label: string;
  href?: string;
  sub?: string;
  removePayload?: LinkPayload;
};

export type AddConfig = {
  template: Record<string, unknown>;
  idField: string;
  lookupType: "creator" | "project" | "organization" | "format" | "person" | "entity" | "collection";
  lookupKind?: string;
  roleField?: string;
  roleOptions?: LabeledValue[];
  roleDefault?: string;
  createKind?: "entity" | "organization" | "project" | "person" | "format";
  buttonLabel?: string;
  placeholder?: string;
};

type LookupItem = { id: string; name: string; sub?: string };

export function AddLinkPopover({
  config,
  onDone,
}: {
  config: AddConfig;
  onDone: () => void;
}) {
  const [role, setRole] = useState(
    config.roleDefault ?? config.roleOptions?.[0]?.value ?? "",
  );
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const fetchItems = useMemo(() => lookupItems(config.lookupType, config.lookupKind), [config.lookupType, config.lookupKind]);

  const link = async (item: LookupItem) => {
    setBusy(true);
    const payload = {
      ...config.template,
      [config.idField]: item.id,
      ...(config.roleField && role ? { [config.roleField]: role } : {}),
    } as LinkPayload;
    const res = await addLink(payload);
    setBusy(false);
    if (res.ok) {
      toast(`Linked ${item.name}`, {
        undo: async () => {
          await removeLink(payload);
          router.refresh();
        },
      });
      onDone();
      router.refresh();
    } else {
      toast(res.error, { tone: "error" });
    }
  };

  const createAndLink = async (name: string) => {
    if (!name || !config.createKind) return;
    setBusy(true);
    const result =
      config.createKind === "entity"
        ? await createEntityInline(config.lookupKind ?? "tag", name)
        : config.createKind === "organization"
          ? await createOrganizationInline(name)
          : config.createKind === "project"
            ? await createProjectInline(name)
            : config.createKind === "person"
              ? await createPersonInline(name)
              : await createFormatInline(name);
    setBusy(false);
    if (!result.ok) {
      toast(result.error, { tone: "error" });
      return;
    }
    if (result.existed) toast(`Using existing “${result.name}”`);
    await link({ id: result.id, name: result.name });
  };

  return (
    <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-md border border-line bg-surface p-2 shadow-pop">
      <Combobox
        autoFocus
        aria-label={config.placeholder ?? "Search"}
        placeholder={config.placeholder ?? "Search…"}
        fetchItems={fetchItems}
        onPick={link}
        onCreate={config.createKind ? createAndLink : undefined}
        onEscape={onDone}
        busy={busy}
        before={config.roleOptions && (
          <select
            className="mt-2"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            aria-label="Relationship type"
          >
            {config.roleOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      />
    </div>
  );
}

/**
 * The universal relationship editor: renders clickable chips for linked
 * records, with add/remove controls for editors. Small edits autosave with
 * an undo toast.
 */
export function LinkChips({
  items,
  addConfig,
  canEdit,
  emptyMessage,
}: {
  items: ChipItem[];
  addConfig?: AddConfig;
  canEdit: boolean;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleRemove = async (item: ChipItem) => {
    if (!item.removePayload) return;
    const payload = item.removePayload;
    const res = await removeLink(payload);
    if (res.ok) {
      toast(`Removed ${item.label}`, {
        undo: async () => {
          await addLink(payload);
          router.refresh();
        },
      });
      router.refresh();
    } else {
      toast(res.error, { tone: "error" });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((item) => (
        <span key={item.key} className="chip !pr-1.5">
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-accent-deep hover:underline underline-offset-2"
            >
              {item.label}
            </Link>
          ) : (
            <span>{item.label}</span>
          )}
          {item.sub && <span className="text-xs text-muted">{item.sub}</span>}
          {canEdit && item.removePayload && (
            <button
              aria-label={`Remove ${item.label}`}
              className="ml-0.5 rounded px-0.5 text-muted hover:bg-wash hover:text-accent"
              onClick={() => handleRemove(item)}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {!items.length && !canEdit && (
        <span className="text-sm text-faint">{emptyMessage ?? "None yet."}</span>
      )}
      {canEdit && addConfig && (
        <span className="relative">
          <button
            className="chip border-dashed text-muted hover:text-accent-deep"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {addConfig.buttonLabel ?? "+ Add"}
          </button>
          {open && (
            <>
              <div
                className="fixed inset-0 z-20"
                aria-hidden
                onClick={() => setOpen(false)}
              />
              <AddLinkPopover config={addConfig} onDone={() => setOpen(false)} />
            </>
          )}
        </span>
      )}
      {!items.length && canEdit && !addConfig && (
        <span className="text-sm text-faint">{emptyMessage ?? "None yet."}</span>
      )}
    </div>
  );
}
