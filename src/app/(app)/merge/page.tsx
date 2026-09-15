import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { RECORD_REGISTRY, type IngestTargetType } from "@/lib/ingest/registry";
import { MERGEABLE_TYPES, compareValues, possibleDuplicates, type MergeableType } from "@/lib/merge-records";
import { MergeCompare } from "@/components/merge-compare";
import { MergePicker } from "@/components/merge-picker";
import { typeLabel } from "@/lib/record-types";

export const metadata = { title: "Merge records" };

export default async function MergePage({ searchParams }: { searchParams: Promise<{ type?: string; a?: string; b?: string }> }) {
  await requireRole("EDITOR");
  const { type, a, b } = await searchParams;
  if (!type || !a || !(MERGEABLE_TYPES as readonly string[]).includes(type)) notFound();
  const mergeType = type as MergeableType;
  const spec = RECORD_REGISTRY[mergeType as IngestTargetType];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (db as any)[spec.prismaModel];
  const recA = await model.findUnique({ where: { id: a } });
  if (!recA) notFound();
  const nameA = String(recA[spec.nameField]);

  if (!b) {
    const suggestions = await possibleDuplicates(mergeType, a, nameA, 5);
    return (
      <div className="mx-auto max-w-2xl">
        <p className="overline mb-1">Merge {typeLabel(mergeType).toLowerCase()}</p>
        <h1 className="font-display text-2xl font-bold tracking-tight">Merge <Link href={spec.path(recA.slug)} className="underline underline-offset-4">{nameA}</Link> with…</h1>
        <p className="mt-2 text-sm text-muted">Pick the other record. You will choose which values survive on the next screen; the record that loses is archived with everything it had, so nothing is lost.</p>
        <MergePicker type={mergeType} aId={a} suggestions={suggestions.map((s) => ({ id: s.id, name: s.name, sub: `${Math.round(s.sim * 100)}% similar name` }))} />
      </div>
    );
  }

  const recB = await model.findUnique({ where: { id: b } });
  if (!recB || b === a) notFound();
  const rows = compareValues(mergeType, recA as Record<string, unknown>, recB as Record<string, unknown>);
  const counts = async (id: string) => db.auditLog.count({ where: { targetType: mergeType, targetId: id } });
  const [histA, histB] = await Promise.all([counts(a), counts(b)]);
  return (
    <div className="mx-auto max-w-4xl">
      <p className="overline mb-1">Merge {typeLabel(mergeType).toLowerCase()}</p>
      <h1 className="font-display text-2xl font-bold tracking-tight">Which values survive?</h1>
      <p className="mt-2 text-sm text-muted">Links, notes, files and history from both records are combined on the record you keep. The other is archived untouched, marked “merged into”.</p>
      <MergeCompare
        type={mergeType}
        a={{ id: a, name: nameA, href: spec.path(recA.slug), archived: !!recA.archived, updatedAt: new Date(recA.updatedAt).toISOString(), history: histA }}
        b={{ id: b, name: String(recB[spec.nameField]), href: spec.path(recB.slug), archived: !!recB.archived, updatedAt: new Date(recB.updatedAt).toISOString(), history: histB }}
        rows={rows}
      />
    </div>
  );
}
