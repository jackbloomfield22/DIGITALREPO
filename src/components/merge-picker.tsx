"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Combobox, lookupItems } from "@/components/combobox";

type Item = { id: string; name: string; sub?: string };

export function MergePicker({ type, aId, suggestions }: { type: string; aId: string; suggestions: Item[] }) {
  const router = useRouter();
  const fetchItems = useMemo(() => lookupItems(type), [type]);
  return (
    <div className="mt-5">
      <Combobox
        autoFocus
        aria-label="Find the other record"
        placeholder="Search by name…"
        fetchItems={fetchItems}
        exclude={[aId]}
        emptyItems={suggestions}
        emptyHint="Type a name. Likely duplicates would be listed here."
        listClassName="rounded-md border border-line bg-surface p-1"
        onPick={(r) => router.push(`/merge?type=${type}&a=${aId}&b=${r.id}`)}
      />
    </div>
  );
}
