"use client";

import { Combobox, type ComboItem } from "@/components/combobox";

// Name pickers backed by /api/hq/lookup. Choosing a Repo person or talent who
// is not yet in HQ hands back their Repo identity; the caller turns that into
// a relationship.

export type PersonPick = { relationshipId?: string; personType?: "person" | "creator"; personId?: string; name: string };

type HqLookup = {
  relationships: { id: string; name: string; tier: string }[];
  people: { id: string; name: string; title: string | null }[];
  creators: { id: string; name: string; headline: string | null }[];
  pipelines: { id: string; title: string; stage: string }[];
};

async function hqLookup(q: string, signal: AbortSignal): Promise<HqLookup | null> {
  const res = await fetch(`/api/hq/lookup?q=${encodeURIComponent(q)}`, { signal });
  return res.ok ? ((await res.json()) as HqLookup) : null;
}

const peopleItems = async (q: string, signal: AbortSignal): Promise<ComboItem[]> => {
  const r = await hqLookup(q, signal);
  if (!r) return [];
  return [
    ...r.relationships.map((x) => ({ id: `rel:${x.id}`, name: x.name })),
    ...r.people.map((x) => ({ id: `person:${x.id}`, name: x.name, sub: x.title ?? "from the Repo" })),
    ...r.creators.map((x) => ({ id: `creator:${x.id}`, name: x.name, sub: x.headline ?? "talent, from the Repo" })),
  ];
};

export function PersonPicker({ onPick, placeholder = "Find a person…", autoFocus }: { onPick: (p: PersonPick) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <Combobox
      aria-label={placeholder}
      placeholder={placeholder}
      autoFocus={autoFocus}
      minChars={2}
      fetchItems={peopleItems}
      inputClassName="text-sm"
      listClassName="absolute z-20 w-full rounded-md border border-line bg-surface p-1 shadow-pop empty:hidden"
      className="relative"
      emptyHint="Type at least two letters."
      onPick={(item) => {
        const [kind, id] = item.id.split(":", 2);
        if (kind === "rel") onPick({ relationshipId: id, name: item.name });
        else onPick({ personType: kind as "person" | "creator", personId: id, name: item.name });
      }}
    />
  );
}

const cardItems = async (q: string, signal: AbortSignal): Promise<ComboItem[]> => {
  const r = await hqLookup(q, signal);
  return r ? r.pipelines.map((x) => ({ id: x.id, name: x.title, sub: x.stage.replace(/_/g, " ") })) : [];
};

export function CardPicker({ onPick, placeholder = "Find a pipeline card…" }: { onPick: (p: { id: string; title: string }) => void; placeholder?: string }) {
  return (
    <Combobox
      aria-label={placeholder}
      placeholder={placeholder}
      minChars={2}
      fetchItems={cardItems}
      inputClassName="text-sm"
      listClassName="absolute z-20 w-full rounded-md border border-line bg-surface p-1 shadow-pop empty:hidden"
      className="relative"
      emptyHint="Type at least two letters."
      onPick={(item) => onPick({ id: item.id, title: item.name })}
    />
  );
}
