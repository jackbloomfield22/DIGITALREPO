"use client";

// The top of every record page: the name (click to edit), what kind of record
// it is, its status, a star, and the actions — New note, Link, Verify, and a
// menu with Merge, Archive, History and Copy link. Banners above it say when
// the record is in the Archive or was merged into another, and when it looks
// like a duplicate of something else.

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { InlineField, RecordVersion } from "@/components/inline-field";
import { FavoriteButton } from "@/components/action-buttons";
import { RowStatus } from "@/components/row-status";
import { Modal } from "@/components/overlay";
import { useToast } from "@/components/toast";
import { archiveRecord, restoreRecord } from "@/lib/actions/quick-edit";
import type { ArchiveType, StatusType } from "@/lib/row-status";
import type { DetailField } from "@/lib/record-fields";
import type { Duplicate, MergedInto } from "@/lib/merge-records";

export type LinkTarget = { key: string; label: string };

export function RecordHeader({
  type, id, slug, path, version, name, typeLabel, canEdit, favorited, archived, archivedReason, mergedInto, duplicates, status,
  editHref, media, subtitle, badges, actions, nav, verify, linkTargets, mergeable = true,
}: {
  type: string; id: string; slug: string; path: string; version: number | null;
  name: DetailField; typeLabel: string; canEdit: boolean; favorited: boolean;
  archived: boolean; archivedReason?: string | null; mergedInto?: MergedInto | null; duplicates?: Duplicate[];
  status?: { type: StatusType; value: string } | null;
  editHref?: string; media?: ReactNode; subtitle?: ReactNode; badges?: ReactNode; actions?: ReactNode; nav?: ReactNode; verify?: ReactNode;
  linkTargets?: LinkTarget[]; mergeable?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [menu, setMenu] = useState(false);
  const [linkMenu, setLinkMenu] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [displayName, setDisplayName] = useState(name.value == null ? "" : String(name.value));
  void slug;

  useEffect(() => {
    if (!menu && !linkMenu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) { setMenu(false); setLinkMenu(false); } };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(false); setLinkMenu(false); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", key); };
  }, [menu, linkMenu]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}${path}`); toast("Link copied"); }
    catch { toast("Could not copy the link.", { tone: "error" }); }
    setMenu(false);
  };
  const doArchive = async () => {
    setBusy(true);
    const res = await archiveRecord(type as ArchiveType, id, reason);
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "Could not archive that.", { tone: "error" });
    setArchiving(false);
    toast(`${displayName} moved to the Archive`, { undo: async () => { await restoreRecord(type as ArchiveType, id); router.refresh(); } });
    router.refresh();
  };
  const doRestore = async () => {
    setMenu(false);
    const res = await restoreRecord(type as ArchiveType, id);
    if (!res.ok) return toast(res.error ?? "Could not restore that.", { tone: "error" });
    toast(`${displayName} is back`);
    router.refresh();
  };
  const goTab = (tab: string, extra = "") => { router.push(`${path}?tab=${tab}${extra}`); setMenu(false); setLinkMenu(false); };

  return (
    <header className="mb-6">
      <RecordVersion type={type} id={id} version={version} />
      {archived && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-warn/40 bg-[#fbf6e6] px-4 py-2.5 text-sm">
          <span>
            <span className="font-semibold">In the Archive.</span>{" "}
            {mergedInto ? (
              <>Merged into {mergedInto.href ? <Link href={mergedInto.href} className="font-medium underline underline-offset-2">{mergedInto.name}</Link> : <span className="font-medium">{mergedInto.name}</span>}{mergedInto.by ? ` by ${mergedInto.by}` : ""}. Everything it had is kept here.</>
            ) : archivedReason ? archivedReason : "It stays out of the live lists but keeps everything."}
          </span>
          {canEdit && !mergedInto && <button type="button" className="btn btn-secondary btn-sm" onClick={doRestore}>Restore</button>}
        </div>
      )}
      {!archived && canEdit && mergeable && duplicates && duplicates.length > 0 && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-wash px-4 py-2 text-sm">
          <span>
            Looks like a duplicate of{" "}
            {duplicates.map((d, i) => (
              <span key={d.id}>{i > 0 && ", "}<Link href={`?peek=${type}:${d.id}`} className="font-medium underline underline-offset-2">{d.name}</Link></span>
            ))}
            .
          </span>
          <Link href={`/merge?type=${type}&a=${id}&b=${duplicates[0].id}`} className="btn btn-secondary btn-sm">Compare &amp; merge</Link>
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {media}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="overline">{typeLabel}</span>
            {status && <RowStatus type={status.type} id={id} status={status.value} name={displayName} canEdit={canEdit} archivable={false} />}
            {badges}
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            <InlineField type={type} id={id} field={name} canEdit={canEdit} heading placeholder="Untitled" onSaved={(v) => setDisplayName(v == null ? "" : String(v))} />
          </h1>
          {subtitle}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {nav}
            <FavoriteButton targetType={type} targetId={id} favorited={favorited} />
            {canEdit && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.dispatchEvent(new CustomEvent("open-quick-capture"))} title="Write a note about this record (N)">
                New note
              </button>
            )}
            {canEdit && linkTargets && linkTargets.length > 0 && (
              <div className="relative" ref={linkMenu ? menuRef : undefined}>
                <button type="button" className="btn btn-secondary btn-sm" aria-haspopup="menu" aria-expanded={linkMenu} onClick={() => { setLinkMenu((v) => !v); setMenu(false); }} title="Link another record (L)">
                  Link
                </button>
                {linkMenu && (
                  <div role="menu" className="absolute left-0 z-30 mt-1 min-w-44 rounded-md border border-line bg-surface p-1 shadow-pop">
                    {linkTargets.map((t) => (
                      <button key={t.key} role="menuitem" type="button" className="block w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-wash" onClick={() => goTab(t.key, "&link=1")}>
                        Link {t.label.toLowerCase()}…
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {verify}
            {actions}
            <div className="relative" ref={menu ? menuRef : undefined}>
              <button type="button" className="btn btn-secondary btn-sm px-2" aria-label="More actions" aria-haspopup="menu" aria-expanded={menu} onClick={() => { setMenu((v) => !v); setLinkMenu(false); }}>
                ⋯
              </button>
              {menu && (
                <div role="menu" className="absolute right-0 z-30 mt-1 min-w-48 rounded-md border border-line bg-surface p-1 shadow-pop">
                  {canEdit && mergeable && !archived && <Link role="menuitem" href={`/merge?type=${type}&a=${id}`} className="block rounded px-2.5 py-1.5 text-sm hover:bg-wash" onClick={() => setMenu(false)}>Merge with…</Link>}
                  <button role="menuitem" type="button" className="block w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-wash" onClick={() => goTab("activity")}>History</button>
                  <button role="menuitem" type="button" className="block w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-wash" onClick={copyLink}>Copy link</button>
                  {canEdit && editHref && <Link role="menuitem" href={editHref} className="block rounded px-2.5 py-1.5 text-sm hover:bg-wash" onClick={() => setMenu(false)}>Open the full form</Link>}
                  {canEdit && !archived && <button role="menuitem" type="button" className="block w-full rounded px-2.5 py-1.5 text-left text-sm text-accent-deep hover:bg-accent-wash" onClick={() => { setMenu(false); setArchiving(true); }}>Archive…</button>}
                  {canEdit && archived && !mergedInto && <button role="menuitem" type="button" className="block w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-wash" onClick={doRestore}>Restore</button>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Modal open={archiving} onClose={() => !busy && setArchiving(false)} title={`Move ${displayName} to the Archive?`}>
        <p className="text-sm text-muted">It leaves the live lists but keeps everything — links, notes, files and history — and can be restored any time.</p>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-xs font-semibold text-muted">Why? (optional)</span>
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Passed, went quiet, duplicate…" onKeyDown={(e) => { if (e.key === "Enter") void doArchive(); }} />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setArchiving(false)}>Cancel</button>
          <button type="button" className="btn btn-accent btn-sm" disabled={busy} onClick={doArchive}>{busy ? "Archiving…" : "Archive"}</button>
        </div>
      </Modal>
    </header>
  );
}
