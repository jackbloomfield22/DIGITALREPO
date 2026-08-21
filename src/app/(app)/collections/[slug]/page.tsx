import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { resolveTargets } from "@/lib/resolve-targets";
import { Portrait, Section } from "@/components/ui";
import { LinkChips } from "@/components/link-editor";
import { CollectionHeader } from "@/components/collection-header";
import { labelFor } from "@/lib/taxonomy";
import { relativeTime } from "@/lib/format";

const GROUPS: [string, string][] = [
  ["creator", "Creators"],
  ["format", "Formats"],
  ["project", "Projects"],
  ["organization", "Organizations"],
];

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const collection = await db.collection.findUnique({
    where: { slug },
    include: { items: { orderBy: { addedAt: "desc" } }, owner: { select: { name: true } } },
  });
  if (!collection) notFound();
  const canEdit = hasRole(user, "EDITOR");

  const resolved = await resolveTargets(collection.items);

  return (
    <div>
      <CollectionHeader
        collection={{
          id: collection.id,
          name: collection.name,
          description: collection.description,
        }}
        canEdit={canEdit}
        meta={`${collection.items.length} items · ${collection.owner?.name ?? "—"} · updated ${relativeTime(collection.updatedAt)}`}
      />

      {GROUPS.map(([type, title]) => {
        const items = collection.items.filter((i) => i.targetType === type);
        if (!items.length) return null;
        return (
          <Section key={type} title={title}>
            {type === "creator" ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => {
                  const r = resolved.get(`${item.targetType}:${item.targetId}`);
                  if (!r) return null;
                  return (
                    <div key={item.id} className="card flex items-center gap-3 p-3">
                      <Link href={r.href} className="flex min-w-0 flex-1 items-center gap-3 hover:text-accent-deep">
                        <Portrait name={r.label} imageUrl={r.imageUrl} className="h-10 w-10 shrink-0 rounded" textClass="text-xs" />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{r.label}</span>
                          {r.sub && <span className="block truncate text-xs text-muted">{r.sub}</span>}
                        </span>
                      </Link>
                      {canEdit && (
                        <LinkChips
                          canEdit
                          items={[{
                            key: item.id,
                            label: "remove",
                            removePayload: { kind: "collection_item", collectionId: collection.id, targetType: item.targetType, targetId: item.targetId },
                          }]}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <LinkChips
                canEdit={canEdit}
                items={items.map((item) => {
                  const r = resolved.get(`${item.targetType}:${item.targetId}`);
                  return {
                    key: item.id,
                    label: r?.label ?? "(missing)",
                    sub: r?.sub,
                    href: r?.href,
                    removePayload: {
                      kind: "collection_item" as const,
                      collectionId: collection.id,
                      targetType: item.targetType,
                      targetId: item.targetId,
                    },
                  };
                })}
              />
            )}
          </Section>
        );
      })}

      {collection.items.length === 0 && (
        <p className="text-sm text-faint">
          Nothing here yet — add creators, formats, projects, or organizations from their pages
          with “+ Collection”.
        </p>
      )}

      {canEdit && (
        <Section title="Add Items">
          <div className="flex flex-wrap gap-4">
            {GROUPS.map(([type, title]) => (
              <LinkChips
                key={type}
                canEdit
                items={[]}
                addConfig={{
                  template: { kind: "collection_item", collectionId: collection.id, targetType: type },
                  idField: "targetId",
                  lookupType: type as "creator",
                  buttonLabel: `+ ${labelFor(type)}`,
                  placeholder: `Search ${title.toLowerCase()}…`,
                }}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
