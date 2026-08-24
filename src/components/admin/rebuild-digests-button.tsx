"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { rebuildDigests } from "@/lib/actions/digest-admin";
import { useToast } from "@/components/toast";

export function RebuildDigestsButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  return (
    <button
      className="btn btn-primary btn-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const result = await rebuildDigests();
        toast(result.ok ? `Rebuilt ${result.built} digest rows` : (result.error ?? "Failed"), result.ok ? {} : { tone: "error" });
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? "Rebuilding…" : "Rebuild Knowledge Digest"}
    </button>
  );
}
