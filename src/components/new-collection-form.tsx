"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCollectionInline } from "@/lib/actions/create-inline";
import { updateCollection } from "@/lib/actions/misc";
import { useToast } from "@/components/toast";

export function NewCollectionForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight">New Collection</h1>
      <div className="card space-y-4 p-6">
        <div>
          <label htmlFor="nc-name">Name *</label>
          <input id="nc-name" type="text" className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="nc-desc">Description</label>
          <textarea id="nc-desc" rows={3} className="mt-1" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <button
          className="btn btn-primary w-full"
          disabled={saving || !name.trim()}
          onClick={async () => {
            setSaving(true);
            const res = await createCollectionInline(name.trim());
            if (!res.ok) {
              toast(res.error, { tone: "error" });
              setSaving(false);
              return;
            }
            if (description.trim()) {
              await updateCollection({ id: res.id, name: res.name, description: description.trim() });
            }
            toast(res.existed ? `Opened existing “${res.name}”` : `Created ${res.name}`);
            router.push("/collections");
            router.refresh();
          }}
        >
          {saving ? "Creating…" : "Create Collection"}
        </button>
      </div>
    </div>
  );
}
