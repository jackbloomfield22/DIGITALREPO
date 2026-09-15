"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleFavorite } from "@/lib/actions/misc";
import { addLink, removeLink } from "@/lib/actions/links";
import { createCollectionInline } from "@/lib/actions/create-inline";
import { useToast } from "@/components/toast";
import { Combobox, lookupItems } from "@/components/combobox";

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
      className={`${small ? "text-sm" : "btn btn-secondary btn-sm"} leading-none ${
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

const collectionLookup = lookupItems("collection");

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
  const router = useRouter();
  const { toast } = useToast();

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
            <Combobox
              autoFocus
              aria-label="Collection name"
              placeholder="Find or create collection…"
              fetchItems={collectionLookup}
              onEscape={() => setOpen(false)}
              onPick={(item) => add(item.id, item.name)}
              createLabel={(name) => `+ New collection “${name}”`}
              onCreate={async (name) => {
                const result = await createCollectionInline(name);
                if (result.ok) await add(result.id, result.name);
                else toast(result.error, { tone: "error" });
              }}
            />
          </div>
        </>
      )}
    </span>
  );
}
