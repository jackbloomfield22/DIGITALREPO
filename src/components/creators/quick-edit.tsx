"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "@/components/overlay";
import { LinkChips } from "@/components/link-editor";
import { updateCreator, updateSocialProfiles } from "@/lib/actions/creators";
import { CREATOR_STATUSES } from "@/lib/taxonomy";
import { useToast } from "@/components/toast";
import type { CreatorDetailVM } from "./types";

/**
 * Quick Edit drawer: the fast path for the fields editors touch most.
 * Chips (categories, interests, formats) autosave; scalar fields save on
 * demand. "Open Full Editor" goes to the complete edit page.
 */
export function QuickEditDrawer({
  slug,
  onClose,
}: {
  slug: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<CreatorDetailVM | null>(null);
  const [status, setStatus] = useState("active");
  const [headline, setHeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  // Adjust state during render when the target changes (avoids a reset effect).
  if (slug !== loadedSlug) {
    setLoadedSlug(slug);
    setData(null);
    setDirty(false);
  }

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetch(`/api/creators/${slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CreatorDetailVM | null) => {
        if (cancelled || !d) return;
        setData(d);
        setStatus(d.status);
        setHeadline(d.headline ?? "");
        setNotes(d.internalNotes ?? "");
        setCounts(
          Object.fromEntries(
            d.socials.map((s) => [s.id, s.followerCount?.toString() ?? ""]),
          ),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    const scalarRes = await updateCreator({
      id: data.id,
      expectedVersion: data.version,
      scalars: {
        name: data.name,
        headline,
        status,
        internalNotes: notes,
        miniBio: data.miniBio,
        age: data.age,
      },
    });
    let ok = scalarRes.ok;
    if (ok) {
      const socialRes = await updateSocialProfiles(
        data.id,
        data.socials.map((s) => ({
          id: s.id,
          platform: s.platform,
          handle: s.handle,
          url: s.url,
          followerCount: counts[s.id] === "" ? null : Number(counts[s.id]),
        })),
      );
      ok = socialRes.ok;
      if (!socialRes.ok) toast(socialRes.error, { tone: "error" });
    } else if (!scalarRes.ok) {
      toast(
        scalarRes.conflict
          ? `${scalarRes.error} (last edited by ${scalarRes.conflict.editedBy})`
          : scalarRes.error,
        { tone: "error" },
      );
    }
    setSaving(false);
    if (ok) {
      toast("Creator updated");
      setDirty(false);
      onClose();
      router.refresh();
    }
  };

  return (
    <Drawer
      open={!!slug}
      onClose={onClose}
      title={data ? `Quick Edit — ${data.name}` : "Quick Edit"}
    >
      {!data ? (
        <div className="py-8 text-center text-sm text-muted">Loading…</div>
      ) : (
        <div className="space-y-5">
          <div>
            <label htmlFor="qe-status">Status</label>
            <select
              id="qe-status"
              className="mt-1"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setDirty(true);
              }}
            >
              {CREATOR_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="qe-headline">Headline</label>
            <input
              id="qe-headline"
              type="text"
              className="mt-1"
              value={headline}
              onChange={(e) => {
                setHeadline(e.target.value);
                setDirty(true);
              }}
            />
          </div>

          <div>
            <div className="overline mb-1.5">Categories</div>
            <LinkChips
              canEdit
              items={data.categories.map((c) => ({
                key: c.id,
                label: c.name,
                removePayload: { kind: "creator_entity", creatorId: data.id, entityId: c.id, relationship: "" },
              }))}
              addConfig={{
                template: { kind: "creator_entity", creatorId: data.id },
                idField: "entityId",
                lookupType: "entity",
                lookupKind: "creator_category",
                createKind: "entity",
                buttonLabel: "+ Category",
              }}
            />
          </div>

          <div>
            <div className="overline mb-1.5">Interests</div>
            <LinkChips
              canEdit
              items={[...data.sports, ...data.interests].map((c) => ({
                key: c.id,
                label: c.name,
                removePayload: { kind: "creator_entity", creatorId: data.id, entityId: c.id, relationship: "" },
              }))}
              addConfig={{
                template: { kind: "creator_entity", creatorId: data.id },
                idField: "entityId",
                lookupType: "entity",
                lookupKind: "interest",
                createKind: "entity",
                buttonLabel: "+ Interest",
              }}
            />
          </div>

          <div>
            <div className="overline mb-1.5">Formats</div>
            <LinkChips
              canEdit
              items={data.formats.map((f) => ({
                key: f.id,
                label: f.title,
                removePayload: { kind: "creator_format", creatorId: data.id, formatId: f.id },
              }))}
              addConfig={{
                template: { kind: "creator_format", creatorId: data.id },
                idField: "formatId",
                lookupType: "format",
                createKind: "format",
                buttonLabel: "+ Format",
              }}
            />
          </div>

          {data.socials.length > 0 && (
            <div>
              <div className="overline mb-1.5">Follower Counts</div>
              <div className="space-y-2">
                {data.socials.map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-sm text-muted">{s.platformLabel}</span>
                    <input
                      type="number"
                      min={0}
                      value={counts[s.id] ?? ""}
                      aria-label={`${s.platformLabel} followers`}
                      onChange={(e) => {
                        setCounts((c) => ({ ...c, [s.id]: e.target.value }));
                        setDirty(true);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="qe-notes">Internal Notes</label>
            <textarea
              id="qe-notes"
              rows={3}
              className="mt-1"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setDirty(true);
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
            <Link
              href={`/creators/${data.slug}/edit`}
              className="text-sm text-muted underline underline-offset-2 hover:text-accent"
            >
              Open Full Editor
            </Link>
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={onClose}>
                {dirty ? "Cancel" : "Close"}
              </button>
              <button className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
