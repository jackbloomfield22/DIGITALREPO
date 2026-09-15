// A Prisma delegate addressed by name. The registry names models as strings
// ("creator", "industryPerson"); this is the one place that string becomes a
// client, so the cast lives here and nowhere else.

import { db } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DynamicRecord = Record<string, any>;

export interface DynamicModel {
  findUnique(args: { where: Record<string, unknown>; select?: Record<string, unknown>; include?: Record<string, unknown> }): Promise<DynamicRecord | null>;
  findFirst(args: Record<string, unknown>): Promise<DynamicRecord | null>;
  findMany(args?: Record<string, unknown>): Promise<DynamicRecord[]>;
  create(args: { data: Record<string, unknown>; select?: Record<string, unknown> }): Promise<DynamicRecord>;
  update(args: { where: Record<string, unknown>; data: Record<string, unknown>; select?: Record<string, unknown> }): Promise<DynamicRecord>;
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  upsert(args: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<DynamicRecord>;
  delete(args: { where: Record<string, unknown> }): Promise<DynamicRecord>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  count(args?: Record<string, unknown>): Promise<number>;
}

/** The delegate for a model name, on the shared client or inside a transaction. */
export function modelFor(name: string, client: unknown = db): DynamicModel {
  const delegate = (client as Record<string, unknown>)[name];
  if (!delegate) throw new Error(`No database model named "${name}".`);
  return delegate as DynamicModel;
}
