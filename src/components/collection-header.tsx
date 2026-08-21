"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCollection, deleteCollection } from "@/lib/actions/misc";
import { useToast } from "@/components/toast";

export function CollectionHeader({
  collection,
  canEdit,
  meta,
}: {
  collection: { id: string; name: string; description: string | null };
  canEdit: boolean;
  meta: string;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? "");
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="mb-8">
      <span className="kind-badge kind-project">Collection</span>
      {!editing ? (
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">{collection.name}</h1>
            {collection.description && <p className="mt-1 max-w-2xl text-sm text-muted">{collection.description}</p>}
            <p className="mt-1 text-xs text-faint">{meta}</p>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit</button>
              <button
                className="btn btn-ghost btn-sm text-accent"
                onClick={async () => {
                  if (!window.confirm(`Delete collection “${collection.name}”? Items themselves are not deleted.`)) return;
                  const res = await deleteCollection(collection.id);
                  if (res.ok) {
                    toast("Collection deleted");
                    router.push("/collections");
                    router.refresh();
                  } else toast(res.error ?? "Failed", { tone: "error" });
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2 max-w-lg space-y-2">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} aria-label="Collection name" />
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Description" placeholder="Description…" />
          <div className="flex gap-2">
            <button
              className="btn btn-primary btn-sm"
              onClick={async () => {
                const res = await updateCollection({ id: collection.id, name, description });
                if (res.ok) {
                  toast("Collection updated");
                  setEditing(false);
                  router.refresh();
                } else toast(res.error ?? "Failed", { tone: "error" });
              }}
            >
              Save
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
