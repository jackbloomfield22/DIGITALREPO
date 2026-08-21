"use client";

import { useRouter } from "next/navigation";
import { markVerified } from "@/lib/actions/creators";
import { useToast } from "@/components/toast";

export function VerifyButton({ creatorId }: { creatorId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <button
      className="btn btn-ghost btn-sm"
      title="Mark this profile's information as verified today"
      onClick={async () => {
        const res = await markVerified(creatorId);
        toast(res.ok ? "Marked as verified" : "Could not update", res.ok ? {} : { tone: "error" });
        router.refresh();
      }}
    >
      ✓ Mark Verified
    </button>
  );
}
