"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Drawer } from "@/components/overlay";
import { Portrait } from "@/components/ui";
import type { CreatorDetailVM } from "./types";

/**
 * Lightweight right-side preview so researchers can evaluate a creator
 * without leaving the directory.
 */
export function QuickPreviewDrawer({
  slug,
  onClose,
}: {
  slug: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<CreatorDetailVM | null>(null);
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);

  // Adjust state during render when the target changes (avoids a reset effect).
  if (slug !== loadedSlug) {
    setLoadedSlug(slug);
    setData(null);
  }

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetch(`/api/creators/${slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <Drawer open={!!slug} onClose={onClose} title={data?.name ?? "Preview"}>
      {!data ? (
        <div className="py-8 text-center text-sm text-muted">Loading…</div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-start gap-4">
            <Portrait
              name={data.name}
              imageUrl={data.imageUrl}
              className="h-20 w-20 shrink-0 rounded-md"
              textClass="text-xl"
            />
            <div className="min-w-0">
              <div className="text-lg font-semibold leading-tight">{data.name}</div>
              {data.headline && (
                <div className="mt-0.5 text-sm text-muted">{data.headline}</div>
              )}
              <div className="mt-1 text-sm text-muted">
                {[data.locations.find((l) => l.relationship === "based_in")?.name, data.age ? `${data.age}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <div className="mt-1 text-sm font-semibold">{data.audience} listed audience</div>
            </div>
          </div>

          {data.socials.length > 0 && (
            <div>
              <div className="overline mb-1.5">Social</div>
              <div className="space-y-0.5 text-sm">
                {data.socials.map((s) => (
                  <div key={s.id} className="flex justify-between">
                    <span className="text-muted">{s.platformLabel}</span>
                    <span className="font-medium">
                      {s.followerCount != null
                        ? Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(s.followerCount)
                        : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(data.interests.length > 0 || data.sports.length > 0) && (
            <div>
              <div className="overline mb-1.5">Interests</div>
              <div className="flex flex-wrap gap-1.5">
                {[...data.sports, ...data.interests].map((e) => (
                  <span key={e.id} className="chip">{e.name}</span>
                ))}
              </div>
            </div>
          )}

          {data.formats.length > 0 && (
            <div>
              <div className="overline mb-1.5">4.4.Forty Formats</div>
              <ul className="space-y-1 text-sm">
                {data.formats.map((f) => (
                  <li key={f.id} className="flex justify-between gap-2">
                    <Link href={`/formats/${f.slug}`} className="truncate hover:text-accent-deep hover:underline">
                      {f.title}
                    </Link>
                    <span className="shrink-0 text-xs text-muted">{f.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.projects.length > 0 && (
            <div>
              <div className="overline mb-1.5">Latest Projects</div>
              <ul className="space-y-1 text-sm">
                {data.projects.slice(0, 5).map((p) => (
                  <li key={p.slug} className="flex justify-between gap-2">
                    <Link href={`/projects/${p.slug}`} className="truncate hover:text-accent-deep hover:underline">
                      {p.title}
                    </Link>
                    <span className="shrink-0 text-xs text-muted">{p.roles.join(", ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.representation.length > 0 && (
            <div>
              <div className="overline mb-1.5">Representation</div>
              <ul className="space-y-1 text-sm">
                {data.representation.map((r) => (
                  <li key={`${r.slug}-${r.relationship}`}>
                    <Link href={`/people/${r.slug}`} className="hover:text-accent-deep hover:underline">
                      {r.name}
                    </Link>{" "}
                    <span className="text-xs text-muted">{r.relationship}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Link href={`/creators/${data.slug}`} className="btn btn-primary w-full">
            Open Full Profile
          </Link>
        </div>
      )}
    </Drawer>
  );
}
