"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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

function AddLinkPopover({
  config,
  onDone,
}: {
  config: AddConfig;
  onDone: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LookupItem[]>([]);
  const [role, setRole] = useState(
    config.roleDefault ?? config.roleOptions?.[0]?.value ?? "",
  );
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ type: config.lookupType, q });
        if (config.lookupKind) params.set("kind", config.lookupKind);
        const res = await fetch(`/api/lookup?${params}`, {
          signal: controller.signal,
        });
        if (res.ok) setResults(await res.json());
      } catch {
        /* aborted */
      }
    }, 150);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q, config.lookupType, config.lookupKind]);

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

  const createAndLink = async () => {
    const name = q.trim();
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

  const exactMatch = results.some(
    (r) => r.name.toLowerCase() === q.trim().toLowerCase(),
  );

  return (
    <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-md border border-line bg-surface p-2 shadow-pop">
      <input
        ref={inputRef}
        type="text"
        placeholder={config.placeholder ?? "Search…"}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) {
            e.preventDefault();
            link(results[0]);
          }
        }}
        aria-label={config.placeholder ?? "Search"}
      />
      {config.roleOptions && (
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
      <div className="mt-2 max-h-56 overflow-y-auto">
        {results.map((r) => (
          <button
            key={r.id}
            disabled={busy}
            onClick={() => link(r)}
            className="flex w-full items-baseline justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-wash"
          >
            <span className="truncate">{r.name}</span>
            {r.sub && <span className="shrink-0 text-xs text-muted">{r.sub}</span>}
          </button>
        ))}
        {q.trim() && !exactMatch && config.createKind && (
          <button
            disabled={busy}
            onClick={createAndLink}
            className="mt-1 w-full rounded border-t border-line px-2 py-1.5 text-left text-sm text-accent-deep hover:bg-accent-wash"
          >
            + Create “{q.trim()}”
          </button>
        )}
        {!results.length && !q.trim() && (
          <div className="px-2 py-1.5 text-xs text-faint">Type to search…</div>
        )}
      </div>
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
