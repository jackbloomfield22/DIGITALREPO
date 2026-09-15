import { requireUser, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { OPTION_SETS, optionSetLabel, primeOptions } from "@/lib/options";
import { OptionsAdmin } from "@/components/settings/options-admin";

export const metadata = { title: "Options" };

export default async function OptionsPage({ searchParams }: { searchParams: Promise<{ set?: string }> }) {
  const user = await requireUser();
  const canEdit = hasRole(user, "EDITOR");
  await primeOptions(true);
  const { set } = await searchParams;

  const rows = await db.option.findMany({ orderBy: [{ setKey: "asc" }, { position: "asc" }] });
  const keys = [...new Set([...Object.keys(OPTION_SETS), ...rows.map((r) => r.setKey)])].sort((a, b) => optionSetLabel(a).localeCompare(optionSetLabel(b)));
  const current = set && keys.includes(set) ? set : keys[0];

  const sets = keys.map((key) => ({
    key,
    label: optionSetLabel(key),
    description: OPTION_SETS[key]?.description,
    count: rows.filter((r) => r.setKey === key && !r.archivedAt).length,
  }));
  const options = rows
    .filter((r) => r.setKey === current)
    .map((r) => ({ id: r.id, value: r.value, label: r.label, color: r.color, position: r.position, archived: !!r.archivedAt, mergedInto: r.mergedInto }));

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-bold tracking-tight">OPTIONS</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Every dropdown in the Repo reads from a list here. Renaming an option changes it everywhere at once — the
        value stored on each record never changes, so nothing breaks. Archiving takes an option out of the pickers
        but leaves it on the records that already carry it. Nothing here deletes.
      </p>
      <OptionsAdmin sets={sets} current={current ?? ""} options={options} canEdit={canEdit} />
    </div>
  );
}
