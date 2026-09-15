"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { verifyRecord } from "@/lib/actions/verify";
import { useToast } from "@/components/toast";
import { Button } from "@/components/button";

export function VerifyButton({ type, id, verifiedAt }: { type: string; id: string; verifiedAt?: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const fresh = verifiedAt ? Date.now() - new Date(verifiedAt).getTime() < 90 * 86_400_000 : false;
  return (
    <Button size="sm" variant={fresh ? "ghost" : "secondary"} loading={busy} title={verifiedAt ? `Last verified ${new Date(verifiedAt).toLocaleDateString()}` : "Mark this record as checked today (V)"} data-verify-button
      onClick={async () => {
        setBusy(true);
        const res = await verifyRecord(type, id);
        setBusy(false);
        toast(res.ok ? "Verified — thank you" : res.error, res.ok ? {} : { tone: "error" });
        router.refresh();
      }}>
      ✓ {fresh ? "Verified" : "Verify"}
    </Button>
  );
}
