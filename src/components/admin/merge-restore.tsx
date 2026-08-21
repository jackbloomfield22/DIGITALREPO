"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mergeEntities, mergeOrganizations, setArchived } from "@/lib/actions/admin";
import { useToast } from "@/components/toast";

export function MergeButtons({
  kind,
  items,
}: {
  kind: "organization" | "entity";
  items: { id: string; label: string }[];
}) {
  const [target, setTarget] = useState(items[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Keep:</span>
      <select
        aria-label="Canonical record to keep"
        className="!w-auto"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      >
        {items.map((i) => (
          <option key={i.id} value={i.id}>{i.label}</option>
        ))}
      </select>
      <button
        className="btn btn-secondary btn-sm"
        disabled={busy}
        onClick={async () => {
          const sources = items.filter((i) => i.id !== target);
          if (!sources.length) return;
          if (!window.confirm(`Merge ${sources.map((s) => s.label).join(", ")} into ${items.find((i) => i.id === target)?.label}? All relationships move to the kept record.`)) return;
          setBusy(true);
          for (const source of sources) {
            const res =
              kind === "organization"
                ? await mergeOrganizations(source.id, target)
                : await mergeEntities(source.id, target);
            if (!res.ok) {
              toast(res.error ?? "Merge failed", { tone: "error" });
              setBusy(false);
              return;
            }
          }
          toast("Merged — relationships preserved");
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? "Merging…" : "Merge"}
      </button>
    </div>
  );
}

export function RestoreButton({
  targetType,
  targetId,
  label,
}: {
  targetType: "creator" | "project" | "organization" | "format" | "opportunity" | "person";
  targetId: string;
  label: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <button
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        const res = await setArchived(targetType, targetId, false);
        toast(res.ok ? `Restored ${label}` : (res.error ?? "Failed"), res.ok ? {} : { tone: "error" });
        router.refresh();
      }}
    >
      Restore
    </button>
  );
}
