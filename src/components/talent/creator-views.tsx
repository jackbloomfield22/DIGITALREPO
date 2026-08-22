"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Portrait } from "@/components/ui";
import { FavoriteButton } from "@/components/action-buttons";
import { QuickPreviewDrawer } from "./quick-preview";
import { QuickEditDrawer } from "./quick-edit";
import { bulkAddEntity, bulkAddToCollection, bulkArchive, bulkSetStatus } from "@/lib/actions/talent";
import { createCollectionInline, createEntityInline } from "@/lib/actions/create-inline";
import { CREATOR_STATUSES } from "@/lib/taxonomy";
import { useToast } from "@/components/toast";
import type { CreatorCardVM } from "./types";

function CardHover({
  creator,
  onPreview,
  onQuickEdit,
  canEdit,
}: {
  creator: CreatorCardVM;
  onPreview: () => void;
  onQuickEdit: () => void;
  canEdit: boolean;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 hidden flex-col justify-end bg-gradient-to-t from-ink/95 via-ink/80 to-transparent p-3 text-paper opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 lg:flex lg:pointer-events-auto lg:group-hover:pointer-events-auto">
    <div className="space-y-2 text-xs">
        {creator.interests.length > 0 && (
          <div>
            <div className="font-semibold uppercase tracking-wider text-paper/60">Interests</div>
            <div className="truncate">{creator.interests.map((i) => i.name).join(" · ")}</div>
          </div>
        )}
        {creator.formats.length > 0 && (
          <div>
            <div className="font-semibold uppercase tracking-wider text-paper/60">Formats</div>
            {creator.formats.map((f) => (
              <div key={f.slug} className="truncate">{f.title}</div>
            ))}
          </div>
        )}
        {creator.projects.length > 0 && (
          <div>
            <div className="font-semibold uppercase tracking-wider text-paper/60">Recent Projects</div>
            {creator.projects.map((p) => (
              <div key={p.slug} className="truncate">{p.title}</div>
            ))}
          </div>
        )}
        {creator.socials.length > 0 && (
          <div>
            <div className="font-semibold uppercase tracking-wider text-paper/60">Social</div>
            <div className="truncate">
              {creator.socials.map((s) => `${s.label} ${s.followers}`).join(" · ")}
            </div>
          </div>
        )}
        <div className="flex gap-1.5 pt-1">
          <span className="rounded bg-paper px-2 py-1 font-medium text-ink">Open</span>
          {canEdit && (
            <button
              className="rounded bg-paper/20 px-2 py-1 font-medium hover:bg-paper/30"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onQuickEdit();
              }}
            >
              Quick Edit
            </button>
          )}
          <button
            className="rounded bg-paper/20 px-2 py-1 font-medium hover:bg-paper/30"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPreview();
            }}
          >
            Preview
          </button>
        </div>
      </div>
    </div>
  );
}

export function CreatorCardGrid({
  creators,
  canEdit,
}: {
  creators: CreatorCardVM[];
  canEdit: boolean;
}) {
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [editSlug, setEditSlug] = useState<string | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {creators.map((creator) => (
          <Link
            key={creator.id}
            href={`/talent/${creator.slug}`}
            className="card group relative block overflow-hidden transition-shadow hover:shadow-pop focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <div className="relative aspect-[4/4.4]">
              <Portrait
                name={creator.name}
                imageUrl={creator.imageUrl}
                className="absolute inset-0 h-full w-full"
                textClass="text-4xl"
              />
              <CardHover
                creator={creator}
                canEdit={canEdit}
                onPreview={() => setPreviewSlug(creator.slug)}
                onQuickEdit={() => setEditSlug(creator.slug)}
              />
              <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-1 rounded bg-ink/30 px-1 backdrop-blur-sm">
                <FavoriteButton
                  small
                  targetType="creator"
                  targetId={creator.id}
                  favorited={creator.favorited}
                />
                <button
                  aria-label={`Preview ${creator.name}`}
                  className="text-base text-paper/80 hover:text-paper lg:hidden"
                  onClick={(e) => {
                    e.preventDefault();
                    setPreviewSlug(creator.slug);
                  }}
                >
                  ⋯
                </button>
              </div>
            </div>
            <div className="p-3">
              <div className="truncate font-display text-base font-bold uppercase tracking-wide">
                {creator.name}
              </div>
              <div className="mt-0.5 truncate text-xs text-muted">
                {creator.categories.map((c) => c.name).join(" · ") || "—"}
              </div>
              <div className="mt-1.5 flex items-baseline justify-between text-xs">
                <span className="truncate text-muted">{creator.basedIn?.name ?? ""}</span>
                <span className="shrink-0 font-semibold">{creator.audience}</span>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between text-xs text-faint">
                <span>
                  {creator.formatCount} {creator.formatCount === 1 ? "Format" : "Formats"}
                </span>
                <span>
                  {creator.projectCount} {creator.projectCount === 1 ? "Project" : "Projects"}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <QuickPreviewDrawer slug={previewSlug} onClose={() => setPreviewSlug(null)} />
      <QuickEditDrawer slug={editSlug} onClose={() => setEditSlug(null)} />
    </>
  );
}

// --- Table view --------------------------------------------------------------

const ALL_COLUMNS = [
  { key: "categories", label: "Categories" },
  { key: "location", label: "Location" },
  { key: "audience", label: "Social Reach" },
  { key: "interests", label: "Interests" },
  { key: "formats", label: "Formats" },
  { key: "projects", label: "Projects" },
  { key: "representation", label: "Representation" },
  { key: "updated", label: "Updated" },
] as const;

type ColumnKey = (typeof ALL_COLUMNS)[number]["key"];
const DEFAULT_COLUMNS: ColumnKey[] = ["categories", "location", "audience", "interests", "formats", "updated"];

function BulkPicker({
  label,
  lookupType,
  lookupKind,
  allowCreate,
  onPick,
}: {
  label: string;
  lookupType: string;
  lookupKind?: string;
  allowCreate?: "entity" | "collection";
  onPick: (id: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      const params = new URLSearchParams({ type: lookupType, q });
      if (lookupKind) params.set("kind", lookupKind);
      try {
        const res = await fetch(`/api/lookup?${params}`, { signal: controller.signal });
        if (res.ok) setItems(await res.json());
      } catch {}
    }, 150);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q, open, lookupType, lookupKind]);

  return (
    <span className="relative">
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen((v) => !v)}>
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-30 mb-1 w-64 rounded-md border border-line bg-surface p-2 shadow-pop">
            <input
              type="text"
              autoFocus
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={label}
            />
            <div className="mt-1 max-h-44 overflow-y-auto">
              {items.map((item) => (
                <button
                  key={item.id}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-wash"
                  onClick={() => {
                    setOpen(false);
                    onPick(item.id, item.name);
                  }}
                >
                  {item.name}
                </button>
              ))}
              {allowCreate && q.trim() && !items.some((i) => i.name.toLowerCase() === q.trim().toLowerCase()) && (
                <button
                  className="mt-1 w-full rounded border-t border-line px-2 py-1.5 text-left text-sm text-accent-deep hover:bg-accent-wash"
                  onClick={async () => {
                    const result =
                      allowCreate === "collection"
                        ? await createCollectionInline(q.trim())
                        : await createEntityInline(lookupKind ?? "tag", q.trim());
                    if (result.ok) {
                      setOpen(false);
                      onPick(result.id, result.name);
                    } else toast(result.error, { tone: "error" });
                  }}
                >
                  + Create “{q.trim()}”
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </span>
  );
}

export function CreatorTable({
  creators,
  canEdit,
  isAdmin,
}: {
  creators: CreatorCardVM[];
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [columnMenu, setColumnMenu] = useState(false);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [editSlug, setEditSlug] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const stored = localStorage.getItem("creator-table-columns");
        if (stored) setColumns(JSON.parse(stored));
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const persistColumns = (next: ColumnKey[]) => {
    setColumns(next);
    try {
      localStorage.setItem("creator-table-columns", JSON.stringify(next));
    } catch {}
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = creators.length > 0 && creators.every((c) => selected.has(c.id));
  const ids = [...selected];

  const exportCsv = () => {
    const rows = creators.filter((c) => selected.has(c.id));
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [
      ["Name", "Categories", "Location", "Audience", "Interests", "Formats", "Projects", "Representation"].join(","),
      ...rows.map((c) =>
        [
          c.name,
          c.categories.map((x) => x.name).join("; "),
          c.basedIn?.name ?? "",
          c.audience,
          c.interests.map((x) => x.name).join("; "),
          c.formats.map((x) => x.title).join("; "),
          c.projects.map((x) => x.title).join("; "),
          c.representation.join("; "),
        ]
          .map(esc)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "creators.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${rows.length} talent records`);
  };

  const cell = (creator: CreatorCardVM, key: ColumnKey) => {
    switch (key) {
      case "categories":
        return creator.categories.map((c) => c.name).join(" · ");
      case "location":
        return creator.basedIn?.name ?? "";
      case "audience":
        return creator.audience;
      case "interests":
        return creator.interests.slice(0, 4).map((i) => i.name).join(" · ");
      case "formats":
        return creator.formats.map((f) => f.title).join(" · ");
      case "projects":
        return creator.projects.map((p) => p.title).join(" · ");
      case "representation":
        return creator.representation.join(" · ");
      case "updated":
        return creator.updated;
    }
  };

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <span className="relative">
          <button className="btn btn-ghost btn-sm" onClick={() => setColumnMenu((v) => !v)}>
            Columns
          </button>
          {columnMenu && (
            <>
              <div className="fixed inset-0 z-20" aria-hidden onClick={() => setColumnMenu(false)} />
              <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-md border border-line bg-surface p-2 shadow-pop">
                {ALL_COLUMNS.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-wash">
                    <input
                      type="checkbox"
                      className="!w-auto"
                      checked={columns.includes(col.key)}
                      onChange={(e) =>
                        persistColumns(
                          e.target.checked
                            ? [...columns, col.key]
                            : columns.filter((c) => c !== col.key),
                        )
                      }
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              {canEdit && (
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    className="!w-auto"
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={() =>
                      setSelected(allSelected ? new Set() : new Set(creators.map((c) => c.id)))
                    }
                  />
                </th>
              )}
              <th className="px-3 py-2 font-semibold">Talent</th>
              {ALL_COLUMNS.filter((c) => columns.includes(c.key)).map((col) => (
                <th key={col.key} className="px-3 py-2 font-semibold">{col.label}</th>
              ))}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {creators.map((creator) => (
              <tr key={creator.id} className="border-b border-line last:border-0 hover:bg-wash/60">
                {canEdit && (
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="!w-auto"
                      aria-label={`Select ${creator.name}`}
                      checked={selected.has(creator.id)}
                      onChange={() => toggle(creator.id)}
                    />
                  </td>
                )}
                <td className="px-3 py-2">
                  <Link
                    href={`/talent/${creator.slug}`}
                    className="flex items-center gap-2 font-medium hover:text-accent-deep"
                  >
                    <Portrait
                      name={creator.name}
                      imageUrl={creator.imageUrl}
                      className="h-7 w-7 shrink-0 rounded"
                      textClass="text-[10px]"
                    />
                    {creator.name}
                  </Link>
                </td>
                {ALL_COLUMNS.filter((c) => columns.includes(c.key)).map((col) => (
                  <td key={col.key} className="max-w-52 truncate px-3 py-2 text-muted">
                    {cell(creator, col.key)}
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <button
                    className="text-xs text-muted underline underline-offset-2 hover:text-accent"
                    onClick={() => setPreviewSlug(creator.slug)}
                  >
                    Preview
                  </button>
                  {canEdit && (
                    <button
                      className="ml-2 text-xs text-muted underline underline-offset-2 hover:text-accent"
                      onClick={() => setEditSlug(creator.slug)}
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && selected.size > 0 && (
        <div className="sticky bottom-4 z-30 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 shadow-pop">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <BulkPicker
            label="+ Collection"
            lookupType="collection"
            allowCreate="collection"
            onPick={async (collectionId, name) => {
              const res = await bulkAddToCollection(ids, collectionId);
              toast(res.ok ? `Added ${ids.length} to ${name}` : res.error, res.ok ? {} : { tone: "error" });
              router.refresh();
            }}
          />
          <BulkPicker
            label="+ Interest"
            lookupType="entity"
            lookupKind="interest"
            allowCreate="entity"
            onPick={async (entityId, name) => {
              const res = await bulkAddEntity(ids, entityId);
              toast(res.ok ? `Added ${name} to ${ids.length} talent records` : res.error, res.ok ? {} : { tone: "error" });
              router.refresh();
            }}
          />
          <BulkPicker
            label="+ Tag"
            lookupType="entity"
            lookupKind="tag"
            allowCreate="entity"
            onPick={async (entityId, name) => {
              const res = await bulkAddEntity(ids, entityId);
              toast(res.ok ? `Tagged ${ids.length} creators with ${name}` : res.error, res.ok ? {} : { tone: "error" });
              router.refresh();
            }}
          />
          <select
            aria-label="Change status"
            className="!w-auto text-sm"
            defaultValue=""
            onChange={async (e) => {
              if (!e.target.value) return;
              const res = await bulkSetStatus(ids, e.target.value);
              toast(res.ok ? `Status updated for ${ids.length} talent records` : res.error, res.ok ? {} : { tone: "error" });
              e.target.value = "";
              router.refresh();
            }}
          >
            <option value="">Change status…</option>
            {CREATOR_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}>
            Export CSV
          </button>
          {isAdmin && (
            <button
              className="btn btn-secondary btn-sm text-accent"
              onClick={async () => {
                if (!window.confirm(`Archive ${ids.length} creators? They can be restored from Admin.`)) return;
                const res = await bulkArchive(ids);
                toast(res.ok ? `Archived ${ids.length} talent records` : res.error, res.ok ? {} : { tone: "error" });
                setSelected(new Set());
                router.refresh();
              }}
            >
              Archive
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      <QuickPreviewDrawer slug={previewSlug} onClose={() => setPreviewSlug(null)} />
      <QuickEditDrawer slug={editSlug} onClose={() => setEditSlug(null)} />
    </div>
  );
}
