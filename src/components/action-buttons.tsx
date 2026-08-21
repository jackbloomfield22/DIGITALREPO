"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleFavorite } from "@/lib/actions/misc";
import { addLink, removeLink } from "@/lib/actions/links";
import { createCollectionInline } from "@/lib/actions/create-inline";
import { useToast } from "@/components/toast";

export function FavoriteButton({
  targetType,
  targetId,
  favorited,
  small,
}: {
  targetType: string;
  targetId: string;
  favorited: boolean;
  small?: boolean;
}) {
  const [isFav, setIsFav] = useState(favorited);
  const router = useRouter();
  const { toast } = useToast();
  return (
    <button
      aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={isFav}
      title={isFav ? "Favorited" : "Favorite"}
      className={`${small ? "text-base" : "btn btn-secondary btn-sm"} leading-none ${
        isFav ? "text-warn" : "text-faint hover:text-warn"
      }`}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const res = await toggleFavorite(targetType, targetId);
        setIsFav(res.favorited);
        toast(res.favorited ? "Added to favorites" : "Removed from favorites");
        router.refresh();
      }}
    >
      {isFav ? "★" : "☆"}
    </button>
  );
}

type LookupItem = { id: string; name: string };

export function AddToCollectionButton({
  targetType,
  targetId,
  targetLabel,
  compact,
}: {
  targetType: string;
  targetId: string;
  targetLabel: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<LookupItem[]>([]);
  const router = useRouter();
  const { toast } = useToast();

  const search = async (value: string) => {
    setQ(value);
    try {
      const res = await fetch(`/api/lookup?type=collection&q=${encodeURIComponent(value)}`);
      if (res.ok) setItems(await res.json());
    } catch {}
  };

  const add = async (collectionId: string, collectionName: string) => {
    const payload = { kind: "collection_item" as const, collectionId, targetType, targetId };
    const res = await addLink(payload);
    if (res.ok) {
      toast(`Added ${targetLabel} to ${collectionName}`, {
        undo: async () => {
          await removeLink(payload);
          router.refresh();
        },
      });
      setOpen(false);
      router.refresh();
    } else toast(res.error, { tone: "error" });
  };

  return (
    <span className="relative inline-block">
      <button
        className={compact ? "chip" : "btn btn-secondary btn-sm"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
          if (!open) search("");
        }}
        aria-expanded={open}
      >
        + Collection
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-20"
            aria-hidden
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            className="absolute right-0 top-full z-30 mt-1 w-64 rounded-md border border-line bg-surface p-2 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="text"
              autoFocus
              placeholder="Find or create collection…"
              value={q}
              onChange={(e) => search(e.target.value)}
              aria-label="Collection name"
            />
            <div className="mt-1 max-h-48 overflow-y-auto">
              {items.map((item) => (
                <button
                  key={item.id}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-wash"
                  onClick={() => add(item.id, item.name)}
                >
                  {item.name}
                </button>
              ))}
              {q.trim() &&
                !items.some((i) => i.name.toLowerCase() === q.trim().toLowerCase()) && (
                  <button
                    className="mt-1 w-full rounded border-t border-line px-2 py-1.5 text-left text-sm text-accent-deep hover:bg-accent-wash"
                    onClick={async () => {
                      const result = await createCollectionInline(q.trim());
                      if (result.ok) await add(result.id, result.name);
                      else toast(result.error, { tone: "error" });
                    }}
                  >
                    + New collection “{q.trim()}”
                  </button>
                )}
            </div>
          </div>
        </>
      )}
    </span>
  );
}
