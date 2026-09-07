"use client";

import { useEffect, useState } from "react";

// Name pickers backed by /api/hq/lookup. Choosing a Repo person or talent who
// is not yet in HQ hands back their Repo identity; the caller turns that into
// a relationship.

export type PersonPick = { relationshipId?: string; personType?: "person" | "creator"; personId?: string; name: string };

export function PersonPicker({ onPick, placeholder = "Find a person…", autoFocus }: { onPick: (p: PersonPick) => void; placeholder?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PersonPick[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/hq/lookup?q=${encodeURIComponent(q.trim())}`).then((x) => x.json()).catch(() => null);
      if (!r) return;
      setRows([
        ...r.relationships.map((x: { id: string; name: string; tier: string }) => ({ relationshipId: x.id, name: `${x.name}`, })),
        ...r.people.map((x: { id: string; name: string; title: string | null }) => ({ personType: "person" as const, personId: x.id, name: x.name + (x.title ? ` — ${x.title}` : "") })),
        ...r.creators.map((x: { id: string; name: string; headline: string | null }) => ({ personType: "creator" as const, personId: x.id, name: x.name + (x.headline ? ` — ${x.headline}` : "") })),
      ]);
    }, 180);
    return () => clearTimeout(t);
  }, [q]);
  const shown = q.trim().length >= 2 ? rows : [];
  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="w-full text-sm" autoFocus={autoFocus} />
      {shown.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-line bg-surface py-1 shadow-lg">
          {shown.map((r, i) => (
            <li key={i}>
              <button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-wash" onClick={() => { onPick(r); setQ(""); setRows([]); }}>
                {r.name} {r.relationshipId ? "" : <span className="text-xs text-faint">· from the Repo</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CardPicker({ onPick, placeholder = "Find a pipeline card…" }: { onPick: (p: { id: string; title: string }) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<{ id: string; title: string; stage: string }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/hq/lookup?q=${encodeURIComponent(q.trim())}`).then((x) => x.json()).catch(() => null);
      if (r) setRows(r.pipelines);
    }, 180);
    return () => clearTimeout(t);
  }, [q]);
  const shown = q.trim().length >= 2 ? rows : [];
  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="w-full text-sm" />
      {shown.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded-md border border-line bg-surface py-1 shadow-lg">
          {shown.map((r) => (
            <li key={r.id}><button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-wash" onClick={() => { onPick(r); setQ(""); setRows([]); }}>{r.title} <span className="text-xs text-faint">{r.stage.replace(/_/g, " ")}</span></button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
