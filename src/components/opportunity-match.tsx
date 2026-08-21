"use client";

import { useRouter } from "next/navigation";
import { addLink, removeLink } from "@/lib/actions/links";
import { useToast } from "@/components/toast";

export function AddCandidateButton({
  opportunityId,
  creatorId,
  creatorName,
}: {
  opportunityId: string;
  creatorId: string;
  creatorName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  return (
    <button
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        const payload = { kind: "opportunity_creator" as const, opportunityId, creatorId };
        const res = await addLink(payload);
        if (res.ok) {
          toast(`Added ${creatorName} to candidates`, {
            undo: async () => {
              await removeLink(payload);
              router.refresh();
            },
          });
          router.refresh();
        } else toast(res.error, { tone: "error" });
      }}
    >
      + Candidate
    </button>
  );
}
