"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createCreator,
  updateCreator,
  updateSocialProfiles,
  findSimilarCreators,
  type CreatorScalarInput,
} from "@/lib/actions/talent";
import { CREATOR_STATUSES, SOCIAL_PLATFORMS } from "@/lib/taxonomy";
import { createEntityInline } from "@/lib/actions/create-inline";
import { useToast } from "@/components/toast";
import { Portrait } from "@/components/ui";
import Link from "next/link";

type EntityPick = { id: string; name: string; relationship?: string };

type SocialRow = {
  id?: string;
  platform: string;
  handle: string;
  url: string;
  followerCount: string;
};

export type CreatorFormInitial = {
  id: string;
  slug: string;
  version: number;
  scalars: CreatorScalarInput;
  socials: SocialRow[];
};

function EntityMultiPick({
  kind,
  label,
  picks,
  setPicks,
  relationship,
}: {
  kind: string;
  label: string;
  picks: EntityPick[];
  setPicks: (p: EntityPick[]) => void;
  relationship?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/lookup?type=entity&kind=${kind}&q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        if (res.ok) setResults(await res.json());
      } catch {}
    }, 150);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q, kind, open]);

  const add = (item: { id: string; name: string }) => {
    if (!picks.some((p) => p.id === item.id)) {
      setPicks([...picks, { ...item, relationship }]);
    }
    setQ("");
    setOpen(false);
  };

  return (
    <div>
      <label>{label}</label>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {picks.map((p) => (
          <span key={p.id} className="chip">
            {p.name}
            <button
              type="button"
              aria-label={`Remove ${p.name}`}
              className="ml-0.5 text-muted hover:text-accent"
              onClick={() => setPicks(picks.filter((x) => x.id !== p.id))}
            >
              ×
            </button>
          </span>
        ))}
        <span className="relative">
          <button
            type="button"
            className="chip border-dashed text-muted"
            onClick={() => setOpen((v) => !v)}
          >
            + Add
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-20" aria-hidden onClick={() => setOpen(false)} />
              <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-md border border-line bg-surface p-2 shadow-pop">
                <input
                  type="text"
                  autoFocus
                  placeholder="Search…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label={`Search ${label}`}
                />
                <div className="mt-1 max-h-44 overflow-y-auto">
                  {results
                    .filter((r) => !picks.some((p) => p.id === r.id))
                    .map((r) => (
                      <button
                        type="button"
                        key={r.id}
                        className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-wash"
                        onClick={() => add(r)}
                      >
                        {r.name}
                      </button>
                    ))}
                  {q.trim() &&
                    !results.some((r) => r.name.toLowerCase() === q.trim().toLowerCase()) && (
                      <button
                        type="button"
                        className="mt-1 w-full rounded border-t border-line px-2 py-1.5 text-left text-sm text-accent-deep hover:bg-accent-wash"
                        onClick={async () => {
                          const result = await createEntityInline(kind, q.trim());
                          if (result.ok) add({ id: result.id, name: result.name });
                          else toast(result.error, { tone: "error" });
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
      </div>
    </div>
  );
}

function Group({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="card group px-5 py-4">
      <summary className="cursor-pointer select-none font-display text-sm font-bold uppercase tracking-widest text-charcoal">
        {title}
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}

export function CreatorForm({ initial }: { initial?: CreatorFormInitial }) {
  const isEdit = !!initial;
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState(initial?.scalars.name ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.scalars.imageUrl ?? "");
  const [headline, setHeadline] = useState(initial?.scalars.headline ?? "");
  const [status, setStatus] = useState(initial?.scalars.status ?? "active");
  const [age, setAge] = useState(initial?.scalars.age?.toString() ?? "");
  const [birthday, setBirthday] = useState(initial?.scalars.birthday ?? "");
  const [miniBio, setMiniBio] = useState(initial?.scalars.miniBio ?? "");
  const [digitalSummary, setDigitalSummary] = useState(initial?.scalars.digitalSummary ?? "");
  const [opportunityNotes, setOpportunityNotes] = useState(initial?.scalars.opportunityNotes ?? "");
  const [internalNotes, setInternalNotes] = useState(initial?.scalars.internalNotes ?? "");
  const [aliases, setAliases] = useState((initial?.scalars.aliases ?? []).join(", "));
  const [socials, setSocials] = useState<SocialRow[]>(initial?.socials ?? []);
  const [categories, setCategories] = useState<EntityPick[]>([]);
  const [location, setLocation] = useState<EntityPick[]>([]);
  const [interests, setInterests] = useState<EntityPick[]>([]);
  const [sports, setSports] = useState<EntityPick[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<{ slug: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const markDirty = () => setDirty(true);

  // Duplicate suggestions while typing a new name
  useEffect(() => {
    const t = setTimeout(async () => {
      if (isEdit || !name.trim()) setDuplicates([]);
      else setDuplicates(await findSimilarCreators(name));
    }, 350);
    return () => clearTimeout(t);
  }, [name, isEdit]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const save = useCallback(async () => {
    if (!name.trim()) {
      toast("Name is required", { tone: "error" });
      return;
    }
    setSaving(true);
    const scalars: CreatorScalarInput = {
      name: name.trim(),
      imageUrl: imageUrl || null,
      headline: headline || null,
      status,
      age: age ? Number(age) : null,
      birthday: birthday || null,
      miniBio: miniBio || null,
      digitalSummary: digitalSummary || null,
      opportunityNotes: opportunityNotes || null,
      internalNotes: internalNotes || null,
      aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean),
    };
    const socialsInput = socials
      .filter((s) => s.platform)
      .map((s) => ({
        id: s.id,
        platform: s.platform,
        handle: s.handle || null,
        url: s.url || null,
        followerCount: s.followerCount === "" ? null : Number(s.followerCount),
      }));

    if (isEdit && initial) {
      const res = await updateCreator({ id: initial.id, expectedVersion: initial.version, scalars });
      if (!res.ok) {
        setSaving(false);
        if (res.conflict) {
          setConflict(
            `${res.error} Last edited by ${res.conflict.editedBy}. Reload to get the latest version — your unsaved changes will be lost.`,
          );
        } else toast(res.error, { tone: "error" });
        return;
      }
      const socialRes = await updateSocialProfiles(initial.id, socialsInput);
      setSaving(false);
      if (!socialRes.ok) {
        toast(socialRes.error, { tone: "error" });
        return;
      }
      toast("Talent profile updated");
      setDirty(false);
      router.push(`/talent/${res.slug}`);
      router.refresh();
    } else {
      const entityIds = [
        ...categories.map((c) => ({ entityId: c.id })),
        ...location.map((l) => ({ entityId: l.id, relationship: "based_in" })),
        ...interests.map((i) => ({ entityId: i.id })),
        ...sports.map((s) => ({ entityId: s.id })),
      ];
      const res = await createCreator({ scalars, entityIds, socials: socialsInput });
      setSaving(false);
      if (!res.ok) {
        toast(res.error, { tone: "error" });
        return;
      }
      toast(`Created ${scalars.name}`);
      setDirty(false);
      router.push(`/talent/${res.slug}`);
      router.refresh();
    }
  }, [name, imageUrl, headline, status, age, birthday, miniBio, digitalSummary, opportunityNotes, internalNotes, aliases, socials, categories, location, interests, sports, isEdit, initial, router, toast]);

  // Cmd/Ctrl+S saves
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);

  const uploadImage = async (file: File) => {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const body = await res.json();
      if (res.ok) {
        setImageUrl(body.url);
        markDirty();
      } else toast(body.error ?? "Upload failed", { tone: "error" });
    } catch {
      toast("Upload failed", { tone: "error" });
    }
    setUploading(false);
  };

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {isEdit ? `Editing ${initial!.scalars.name}` : "New Talent"}
        </h1>
        {dirty && <span className="text-sm font-medium text-warn">Unsaved changes</span>}
      </div>

      {conflict && (
        <div className="mb-4 rounded-md border border-accent bg-accent-wash px-4 py-3 text-sm text-accent-deep">
          {conflict}
          <button className="ml-3 font-semibold underline" onClick={() => window.location.reload()}>
            Reload latest
          </button>
        </div>
      )}

      <div className="space-y-4">
        <Group title="Basics" defaultOpen>
          <div className="flex items-start gap-5">
            <div className="shrink-0">
              <Portrait name={name || "?"} imageUrl={imageUrl || null} className="h-28 w-28 rounded-lg" textClass="text-3xl" />
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadImage(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm mt-2 w-full"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? "Uploading…" : imageUrl ? "Replace Image" : "Add Image"}
              </button>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <label htmlFor="cf-name">Name *</label>
                <input
                  id="cf-name"
                  type="text"
                  className="mt-1"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    markDirty();
                  }}
                  required
                />
                {duplicates.length > 0 && (
                  <div className="mt-1.5 rounded bg-[#f5efdd] px-3 py-2 text-xs text-warn">
                    Possible existing {duplicates.length === 1 ? "match" : "matches"}:{" "}
                    {duplicates.map((d, i) => (
                      <span key={d.slug}>
                        {i > 0 && ", "}
                        <Link className="font-semibold underline" href={`/talent/${d.slug}`}>
                          {d.name}
                        </Link>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="cf-headline">Headline</label>
                <input
                  id="cf-headline"
                  type="text"
                  className="mt-1"
                  placeholder="e.g. Pro soccer forward turned host and founder"
                  value={headline ?? ""}
                  onChange={(e) => {
                    setHeadline(e.target.value);
                    markDirty();
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cf-age">Age</label>
                  <input
                    id="cf-age"
                    type="number"
                    min={0}
                    className="mt-1"
                    value={age}
                    onChange={(e) => {
                      setAge(e.target.value);
                      markDirty();
                    }}
                  />
                </div>
                <div>
                  <label htmlFor="cf-bday">Birthday</label>
                  <input
                    id="cf-bday"
                    type="date"
                    className="mt-1"
                    value={birthday ?? ""}
                    onChange={(e) => {
                      setBirthday(e.target.value);
                      markDirty();
                    }}
                  />
                </div>
              </div>
              {isEdit && (
                <div>
                  <label htmlFor="cf-status">Status</label>
                  <select
                    id="cf-status"
                    className="mt-1"
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      markDirty();
                    }}
                  >
                    {CREATOR_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {isEdit && (
                <div>
                  <label htmlFor="cf-aliases">Aliases (comma-separated)</label>
                  <input
                    id="cf-aliases"
                    type="text"
                    className="mt-1"
                    value={aliases}
                    onChange={(e) => {
                      setAliases(e.target.value);
                      markDirty();
                    }}
                  />
                </div>
              )}
            </div>
          </div>
          {!isEdit && (
            <>
              <EntityMultiPick kind="creator_category" label="Categories" picks={categories} setPicks={(p) => { setCategories(p); markDirty(); }} />
              <EntityMultiPick kind="location" label="Based In" picks={location} setPicks={(p) => { setLocation(p.slice(-1)); markDirty(); }} relationship="based_in" />
            </>
          )}
        </Group>

        <Group title="Social" defaultOpen={isEdit && socials.length > 0}>
          <div className="space-y-3">
            {socials.map((s, i) => (
              <div key={s.id ?? i} className="grid grid-cols-[110px_1fr_1fr_110px_28px] items-center gap-2">
                <select
                  aria-label="Platform"
                  value={s.platform}
                  onChange={(e) => {
                    setSocials(socials.map((x, j) => (j === i ? { ...x, platform: e.target.value } : x)));
                    markDirty();
                  }}
                >
                  {SOCIAL_PLATFORMS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="handle"
                  aria-label="Handle"
                  value={s.handle}
                  onChange={(e) => {
                    setSocials(socials.map((x, j) => (j === i ? { ...x, handle: e.target.value } : x)));
                    markDirty();
                  }}
                />
                <input
                  type="url"
                  placeholder="URL"
                  aria-label="URL"
                  value={s.url}
                  onChange={(e) => {
                    setSocials(socials.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)));
                    markDirty();
                  }}
                />
                <input
                  type="number"
                  min={0}
                  placeholder="Followers"
                  aria-label="Follower count"
                  value={s.followerCount}
                  onChange={(e) => {
                    setSocials(socials.map((x, j) => (j === i ? { ...x, followerCount: e.target.value } : x)));
                    markDirty();
                  }}
                />
                <button
                  type="button"
                  aria-label="Remove social profile"
                  className="text-muted hover:text-accent"
                  onClick={() => {
                    setSocials(socials.filter((_, j) => j !== i));
                    markDirty();
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="chip border-dashed text-muted"
              onClick={() =>
                setSocials([...socials, { platform: "instagram", handle: "", url: "", followerCount: "" }])
              }
            >
              + Add Platform
            </button>
          </div>
        </Group>

        <Group title="Bio" defaultOpen={isEdit && !!miniBio}>
          <div>
            <label htmlFor="cf-bio">Mini Bio</label>
            <textarea id="cf-bio" rows={5} className="mt-1" value={miniBio ?? ""} onChange={(e) => { setMiniBio(e.target.value); markDirty(); }} />
          </div>
          <div>
            <label htmlFor="cf-digital">Digital Summary</label>
            <textarea id="cf-digital" rows={4} className="mt-1" placeholder="Content strengths, strongest platforms, audience notes…" value={digitalSummary ?? ""} onChange={(e) => { setDigitalSummary(e.target.value); markDirty(); }} />
          </div>
          <div>
            <label htmlFor="cf-opp">Opportunity Notes</label>
            <textarea id="cf-opp" rows={3} className="mt-1" placeholder="Why this person may be interesting creatively or commercially…" value={opportunityNotes ?? ""} onChange={(e) => { setOpportunityNotes(e.target.value); markDirty(); }} />
          </div>
        </Group>

        {!isEdit && (
          <Group title="Interests & Sports">
            <EntityMultiPick kind="interest" label="Interests" picks={interests} setPicks={(p) => { setInterests(p); markDirty(); }} />
            <EntityMultiPick kind="sport" label="Sports" picks={sports} setPicks={(p) => { setSports(p); markDirty(); }} />
            <p className="text-xs text-faint">
              Projects, businesses, brands, collaborators, representation, and formats can be
              linked from the profile after creation — each is a one-click add.
            </p>
          </Group>
        )}

        <Group title="Internal Notes" defaultOpen={isEdit && !!internalNotes}>
          <textarea rows={4} aria-label="Internal notes" value={internalNotes ?? ""} onChange={(e) => { setInternalNotes(e.target.value); markDirty(); }} />
        </Group>
      </div>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:left-52">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm text-muted">
            {dirty ? "Unsaved changes" : isEdit ? "All changes saved" : name.trim() ? "Ready to create" : "Name is the only required field"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (dirty && !window.confirm("Discard unsaved changes?")) return;
                setDirty(false);
                router.push(isEdit ? `/talent/${initial!.slug}` : "/talent");
              }}
            >
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={saving || (!dirty && isEdit)} onClick={save}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Talent"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
