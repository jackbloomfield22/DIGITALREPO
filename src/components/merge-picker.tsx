"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Item = { id: string; name: string; sub?: string };

export function MergePicker({ type, aId, suggestions }: { type: string; aId: string; suggestions: Item[] }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Item[]>([]);
  const router = useRouter();
  useEffect(() => {
    if (!q.trim()) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/lookup?type=${type}&q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (res.ok) setResults(((await res.json()) as Item[]).filter((r) => r.id !== aId).slice(0, 10));
      } catch { /* typed on */ }
    }, 150);
    return () => { clearTimeout(t); controller.abort(); };
  }, [q, type, aId]);
  const pick = (id: string) => router.push(`/merge?type=${type}&a=${aId}&b=${id}`);
  const list = q.trim() ? results : suggestions;
  return (
    <div className="mt-5">
      <input autoFocus type="search" placeholder="Search by name…" aria-label="Find the other record" value={q} onChange={(e) => setQ(e.target.value)} />
      {!q.trim() && suggestions.length > 0 && <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Likely duplicates</p>}
      <div className="mt-2 divide-y divide-line rounded-md border border-line bg-surface">
        {list.map((r) => (
          <button key={r.id} type="button" className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-wash" onClick={() => pick(r.id)}>
            <span className="font-medium">{r.name}</span>
            {r.sub && <span className="text-xs text-muted">{r.sub}</span>}
          </button>
        ))}
        {list.length === 0 && <p className="px-3 py-2 text-sm text-faint">{q.trim() ? "No match." : "Type to search."}</p>}
      </div>
    </div>
  );
}
