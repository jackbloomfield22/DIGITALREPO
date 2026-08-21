import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { recordRecentView } from "@/lib/actions/misc";
import { EmptyState, KindBadge, Portrait, Section, StatusPill } from "@/components/ui";
import { LinkChips } from "@/components/link-editor";
import { FavoriteButton, AddToCollectionButton } from "@/components/action-buttons";
import { SourceList, AttachmentList } from "@/components/sources-attachments";
import { labelFor } from "@/lib/taxonomy";
import { formatDate, relativeTime } from "@/lib/format";

export default async function FormatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const format = await db.format.findUnique({
    where: { slug },
    include: {
      creators: { include: { creator: { select: { id: true, name: true, slug: true, imageUrl: true, headline: true } } } },
      entityLinks: { include: { entity: true } },
      organizations: { include: { organization: { select: { id: true, name: true, slug: true } } } },
      opportunities: { include: { opportunity: { select: { title: true, slug: true, status: true } } } },
      owner: { select: { name: true } },
    },
  });
  if (!format || format.archived) notFound();

  const canEdit = hasRole(user, "EDITOR");
  await recordRecentView(user.id, "format", format.id);

  const [favorite, recordSources, attachments] = await Promise.all([
    db.favorite.findUnique({
      where: { userId_targetType_targetId: { userId: user.id, targetType: "format", targetId: format.id } },
    }),
    db.recordSource.findMany({ where: { targetType: "format", targetId: format.id }, include: { source: true } }),
    db.attachment.findMany({ where: { targetType: "format", targetId: format.id } }),
  ]);

  const facts = [
    ["Type", labelFor(format.formatType)],
    ["Target Platform", format.targetPlatform],
    ["Episode Length", format.episodeLength],
    ["Production Scale", format.productionScale],
    ["Location", format.location],
    ["Owner", format.owner?.name],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div>
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2.5">
          <KindBadge kind="format" />
          <StatusPill status={format.status} label={labelFor(format.status)} />
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{format.title}</h1>
            {format.logline && <p className="mt-2 max-w-2xl text-[15px] italic text-charcoal">{format.logline}</p>}
          </div>
          <div className="flex items-center gap-2">
            {canEdit && <Link href={`/formats/${format.slug}/edit`} className="btn btn-primary btn-sm">Edit</Link>}
            <FavoriteButton targetType="format" targetId={format.id} favorited={!!favorite} />
            <AddToCollectionButton targetType="format" targetId={format.id} targetLabel={format.title} />
          </div>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {(format.description || canEdit) && (
            <Section title="Description">
              {format.description ? (
                <p className="whitespace-pre-line text-[15px] leading-relaxed">{format.description}</p>
              ) : (
                <EmptyState message="No description yet." action={<Link className="chip border-dashed" href={`/formats/${format.slug}/edit`}>+ Add Description</Link>} />
              )}
            </Section>
          )}

          <Section title="Creators">
            <div className="space-y-2">
              {format.creators.map((cf) => (
                <div key={cf.id} className="card flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <Link href={`/creators/${cf.creator.slug}`} className="flex min-w-0 items-center gap-2.5 hover:text-accent-deep">
                    <Portrait name={cf.creator.name} imageUrl={cf.creator.imageUrl} className="h-8 w-8 shrink-0 rounded" textClass="text-[11px]" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{cf.creator.name}</span>
                      {cf.creator.headline && <span className="block truncate text-xs text-muted">{cf.creator.headline}</span>}
                    </span>
                  </Link>
                  <div className="flex items-center gap-2">
                    {cf.isPrimary && <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-deep">Primary</span>}
                    <LinkChips
                      canEdit={canEdit}
                      items={[{
                        key: cf.id,
                        label: "detach",
                        removePayload: { kind: "creator_format", creatorId: cf.creatorId, formatId: format.id },
                      }]}
                    />
                  </div>
                </div>
              ))}
              <LinkChips
                canEdit={canEdit}
                items={[]}
                addConfig={{
                  template: { kind: "creator_format", formatId: format.id },
                  idField: "creatorId",
                  lookupType: "creator",
                  buttonLabel: "+ Attach Creator",
                }}
                emptyMessage={format.creators.length ? "" : "No creators attached yet."}
              />
            </div>
          </Section>

          <Section title="Interests, Sports & Topics">
            <LinkChips
              canEdit={canEdit}
              items={format.entityLinks.map((l) => ({
                key: l.id,
                label: l.entity.name,
                sub: labelFor(l.entity.kind),
                href: `/explore/${l.entity.kind}/${l.entity.slug}`,
                removePayload: { kind: "format_entity", formatId: format.id, entityId: l.entityId },
              }))}
              addConfig={{
                template: { kind: "format_entity", formatId: format.id },
                idField: "entityId",
                lookupType: "entity",
                createKind: "entity",
                lookupKind: "interest",
                buttonLabel: "+ Add Topic",
              }}
              emptyMessage="No topics mapped yet."
            />
          </Section>

          <Section title="Organizations">
            <LinkChips
              canEdit={canEdit}
              items={format.organizations.map((fo) => ({
                key: fo.id,
                label: fo.organization.name,
                sub: labelFor(fo.relationship),
                href: `/organizations/${fo.organization.slug}`,
                removePayload: { kind: "format_org", formatId: format.id, organizationId: fo.organizationId },
              }))}
              addConfig={{
                template: { kind: "format_org", formatId: format.id },
                idField: "organizationId",
                lookupType: "organization",
                roleField: "relationship",
                roleOptions: [
                  { value: "target", label: "Target Buyer" },
                  { value: "sponsor_target", label: "Sponsor Target" },
                  { value: "partner", label: "Partner" },
                  { value: "associated", label: "Associated" },
                ],
                createKind: "organization",
                buttonLabel: "+ Add Organization",
              }}
              emptyMessage="No organizations linked."
            />
          </Section>

          {(format.episodeStructure || format.sponsorFit) && (
            <Section title="Format Details">
              {format.episodeStructure && (
                <div className="mb-3">
                  <div className="mb-1 text-xs font-semibold text-muted">Episode Structure</div>
                  <p className="whitespace-pre-line text-sm">{format.episodeStructure}</p>
                </div>
              )}
              {format.sponsorFit && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-muted">Sponsor Fit</div>
                  <p className="whitespace-pre-line text-sm">{format.sponsorFit}</p>
                </div>
              )}
            </Section>
          )}

          <Section title="Sources">
            <SourceList
              canEdit={canEdit}
              targetType="format"
              targetId={format.id}
              sources={recordSources.map((rs) => ({
                recordSourceId: rs.id, title: rs.source.title, url: rs.source.url, sourceType: rs.source.sourceType,
              }))}
            />
          </Section>

          <Section title="Attachments">
            <AttachmentList
              canEdit={canEdit}
              targetType="format"
              targetId={format.id}
              attachments={attachments.map((a) => ({
                id: a.id, filename: a.filename, url: `/api/files/${a.storedPath}`, sizeBytes: a.sizeBytes,
              }))}
            />
          </Section>

          {(format.notes || canEdit) && (
            <Section title="Notes">
              {format.notes ? (
                <p className="whitespace-pre-line text-sm text-muted">{format.notes}</p>
              ) : (
                <p className="text-sm text-faint">No notes.</p>
              )}
            </Section>
          )}
        </div>

        <aside className="min-w-0 space-y-6">
          {facts.length > 0 && (
            <div className="card p-4">
              <div className="overline mb-2">Key Facts</div>
              <ul className="space-y-1 text-sm">
                {facts.map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-3">
                    <span className="text-muted">{k}</span>
                    <span className="text-right font-medium">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {format.opportunities.length > 0 && (
            <div className="card p-4">
              <div className="overline mb-2">Opportunities</div>
              <ul className="space-y-1 text-sm">
                {format.opportunities.map((o) => (
                  <li key={o.id} className="flex items-baseline justify-between gap-2">
                    <Link href={`/opportunities/${o.opportunity.slug}`} className="truncate hover:text-accent-deep hover:underline">
                      {o.opportunity.title}
                    </Link>
                    <span className="shrink-0 text-xs text-muted">{labelFor(o.opportunity.status)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card p-4">
            <div className="overline mb-2">Record</div>
            <ul className="space-y-1 text-xs text-muted">
              <li className="flex justify-between"><span>Updated</span><span>{relativeTime(format.updatedAt)}</span></li>
              <li className="flex justify-between"><span>Created</span><span>{formatDate(format.createdAt)}</span></li>
            </ul>
            <Link href={`/activity?type=format&id=${format.id}`} className="mt-2 inline-block text-xs underline underline-offset-2 hover:text-accent">
              History →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
