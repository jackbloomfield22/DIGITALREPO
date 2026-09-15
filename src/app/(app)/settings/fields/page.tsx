import { requireUser, hasRole } from "@/lib/auth";
import { allFieldDefinitions, FIELD_TYPES } from "@/lib/custom-fields";
import { optionSetChoicesPublic } from "@/lib/actions/fields";
import { DETAIL_TYPES } from "@/lib/record-fields";
import { typeLabel } from "@/lib/record-types";
import { FieldsAdmin } from "@/components/settings/fields-admin";
import { primeOptions } from "@/lib/options";

export const metadata = { title: "Fields" };

export default async function FieldsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const user = await requireUser();
  const canEdit = hasRole(user, "EDITOR");
  await primeOptions(true);
  const { type } = await searchParams;
  const recordType = type && DETAIL_TYPES.includes(type as never) ? type : "creator";

  const [defs, sets] = await Promise.all([allFieldDefinitions(), optionSetChoicesPublic()]);
  const types = DETAIL_TYPES.map((t) => ({ value: t, label: typeLabel(t), count: defs.filter((d) => d.recordType === t && !d.archivedAt).length }));
  const fields = defs
    .filter((d) => d.recordType === recordType)
    .map((d) => ({
      id: d.id, key: d.key, name: d.name, type: d.type, optionSetKey: d.optionSetKey, relationType: d.relationType,
      required: d.required, indexed: d.indexed, showInNeedsAttention: d.showInNeedsAttention, archived: !!d.archivedAt,
    }));

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-bold tracking-tight">FIELDS</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Add a field to any kind of record without a code change. It appears in the Details panel, the list columns,
        the filters and the search straight away. A field&apos;s type is fixed once it exists — archive it and make a
        new one instead. Archiving keeps every value that was ever entered.
      </p>
      <FieldsAdmin
        recordType={recordType}
        types={types}
        fields={fields}
        fieldTypes={FIELD_TYPES}
        optionSets={sets}
        recordTypes={DETAIL_TYPES.map((t) => ({ value: t, label: typeLabel(t) }))}
        canEdit={canEdit}
      />
    </div>
  );
}
