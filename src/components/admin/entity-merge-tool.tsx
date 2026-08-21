"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mergeEntities } from "@/lib/actions/admin";
import { useToast } from "@/components/toast";
import { labelFor } from "@/lib/taxonomy";

export function EntityMergeTool({
  entities,
}: {
  entities: { id: string; name: string; kind: string }[];
}) {
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const source = entities.find((e) => e.id === sourceId);
  const sameKind = entities.filter((e) => !source || e.kind === source.kind);

  return (
    <div className="card mb-8 flex flex-wrap items-end gap-3 p-4 text-sm">
      <div>
        <label htmlFor="merge-source">Merge (removed)</label>
        <select
          id="merge-source"
          className="mt-1 !w-56"
          value={sourceId}
          onChange={(e) => {
            setSourceId(e.target.value);
            setTargetId("");
          }}
        >
          <option value="">Select entity…</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({labelFor(e.kind)})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="merge-target">Into (kept)</label>
        <select
          id="merge-target"
          className="mt-1 !w-56"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          disabled={!sourceId}
        >
          <option value="">Select canonical entity…</option>
          {sameKind
            .filter((e) => e.id !== sourceId)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
      </div>
      <button
        className="btn btn-primary btn-sm"
        disabled={!sourceId || !targetId || busy}
        onClick={async () => {
          const target = entities.find((e) => e.id === targetId);
          if (!window.confirm(`Merge "${source?.name}" into "${target?.name}"? All relationships move over; "${source?.name}" becomes an alias.`)) return;
          setBusy(true);
          const res = await mergeEntities(sourceId, targetId);
          toast(res.ok ? "Merged" : (res.error ?? "Merge failed"), res.ok ? {} : { tone: "error" });
          setBusy(false);
          if (res.ok) {
            setSourceId("");
            setTargetId("");
            router.refresh();
          }
        }}
      >
        {busy ? "Merging…" : "Merge"}
      </button>
    </div>
  );
}
