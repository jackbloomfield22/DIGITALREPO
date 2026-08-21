"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteSavedView } from "@/lib/actions/misc";
import { useToast } from "@/components/toast";

export function SavedViewList({
  views,
}: {
  views: { id: string; name: string; href: string; targetType: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  if (!views.length) {
    return (
      <p className="text-sm text-faint">
        No saved views yet — apply filters in any directory and click “Save View”.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {views.map((v) => (
        <span key={v.id} className="chip bg-accent-wash !border-[#e4c8bd]">
          <Link href={v.href} className="font-medium hover:underline">
            {v.name}
          </Link>
          <span className="text-xs text-muted">{v.targetType}</span>
          <span className="kind-badge kind-format !text-[9px]">Saved View</span>
          <button
            aria-label={`Delete saved view ${v.name}`}
            className="ml-0.5 text-muted hover:text-accent"
            onClick={async () => {
              await deleteSavedView(v.id);
              toast("Saved view deleted");
              router.refresh();
            }}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
