// Previous and next record in alphabetical order, so every record page can
// step to its neighbours even when you arrived from a search or a link.
// The stepper on the page prefers the order of the list you came from and
// only falls back to this.

import "server-only";
import { db } from "@/lib/db";
import { RECORD_PATHS, type SteppableType } from "@/lib/record-paths";

export type Neighbor = { href: string; name: string } | null;
export type Neighbors = { prev: Neighbor; next: Neighbor };

type Spec = { model: string; nameField: "name" | "title"; archived: boolean };
const SPECS: Record<SteppableType, Spec> = {
  creator: { model: "creator", nameField: "name", archived: true },
  format: { model: "format", nameField: "title", archived: true },
  project: { model: "project", nameField: "title", archived: true },
  organization: { model: "organization", nameField: "name", archived: true },
  person: { model: "industryPerson", nameField: "name", archived: true },
  opportunity: { model: "opportunity", nameField: "title", archived: true },
  channel: { model: "channel", nameField: "name", archived: false },
};

export async function recordNeighbors(type: SteppableType, current: { id: string; name: string }): Promise<Neighbors> {
  const spec = SPECS[type];
  const table = (db as unknown as Record<string, { findFirst: (args: unknown) => Promise<{ slug: string; name?: string; title?: string } | null> }>)[spec.model];
  const base = spec.archived ? { archived: false } : {};
  const select = { slug: true, [spec.nameField]: true };
  const pick = (r: { slug: string; name?: string; title?: string } | null): Neighbor =>
    r ? { href: `${RECORD_PATHS[type]}/${r.slug}`, name: (r.name ?? r.title ?? "") } : null;
  const [prev, next] = await Promise.all([
    table.findFirst({
      where: { ...base, OR: [{ [spec.nameField]: { lt: current.name } }, { [spec.nameField]: current.name, id: { lt: current.id } }] },
      orderBy: [{ [spec.nameField]: "desc" }, { id: "desc" }],
      select,
    }),
    table.findFirst({
      where: { ...base, OR: [{ [spec.nameField]: { gt: current.name } }, { [spec.nameField]: current.name, id: { gt: current.id } }] },
      orderBy: [{ [spec.nameField]: "asc" }, { id: "asc" }],
      select,
    }),
  ]);
  return { prev: pick(prev), next: pick(next) };
}
