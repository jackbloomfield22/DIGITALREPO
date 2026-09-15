import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { movedTo } from "@/lib/conversions";
import { UpdatePanel } from "@/components/update-panel";
import { requireUser, hasRole } from "@/lib/auth";
import { recordRecentView } from "@/lib/actions/misc";
import { KindBadge, Section } from "@/components/ui";
import { QuietTimer } from "@/components/quiet-timer";
import { AirtableCard } from "@/components/airtable-card";
import { airtableStateFor } from "@/lib/airtable/sync";
import { RecordStepper } from "@/components/record-stepper";
import { RecordContext } from "@/components/record-context";
import { recordNeighbors } from "@/lib/neighbors";
import { onQuietTimer, quietClock } from "@/lib/quiet-rules";
import { AddToCollectionButton } from "@/components/action-buttons";
import { SourceList } from "@/components/sources-attachments";
import { AttachmentList } from "@/components/attachments";
import { attachmentsFor, uploadLimit } from "@/lib/files";
import { labelFor, PERSON_PROJECT_ROLES } from "@/lib/taxonomy";
import { RecordHeader } from "@/components/record-header";
import { RecordLayout } from "@/components/record-layout";
import { DetailsPanel } from "@/components/details-panel";
import { Highlights } from "@/components/highlights";
import { InlineField } from "@/components/inline-field";
import { RecordTabs, currentTab, type RecordTab } from "@/components/record-tabs";
import { RecordActivity } from "@/components/record-activity";
import { RecordFooter } from "@/components/record-footer";
import { RelationTable } from "@/components/relation-table";
import { detailFields, fieldNamed, nameField, pickFields } from "@/lib/record-fields";
import { recordChrome, type RecordSearchParams } from "@/lib/record-page";

const LONG = ["description", "episodeStructure", "sponsorFit", "notes"];

export default async function FormatPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: RecordSearchParams }) {
  const user = await requireUser();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const format = await db.format.findUnique({
    where: { slug },
    include: {
      creators: { include: { creator: { select: { id: true, name: true, slug: true, imageUrl: true, headline: true } } } },
      entityLinks: { include: { entity: true } },
      organizations: { include: { organization: { select: { id: true, name: true, slug: true } } } },
      people: { include: { person: { select: { id: true, name: true, slug: true, title: true, organizations: { take: 1, include: { organization: { select: { name: true } } } } } } } },
      opportunities: { include: { opportunity: { select: { id: true, title: true, slug: true, status: true } } } },
      owner: { select: { name: true } },
    },
  });
  if (!format) notFound();
  // A page that was moved forwards to its new home.
  if (format.archived) {
    const to = movedTo(format.archivedReason);
    if (to) redirect(to);
  }

  const canEdit = hasRole(user, "EDITOR");
  const limits = uploadLimit();
  const path = `/formats/${format.slug}`;
  await recordRecentView(user.id, "format", format.id);

  const [chrome, recordSources, attachments, airtableState, neighbors] = await Promise.all([
    recordChrome(user.id, "format", format.id, format.title, format.archived),
    db.recordSource.findMany({ where: { targetType: "format", targetId: format.id }, include: { source: true } }),
    attachmentsFor("format", format.id),
    airtableStateFor("format", format.id),
    recordNeighbors("format", { id: format.id, name: format.title }),
  ]);

  const record = format as unknown as Record<string, unknown>;
  const all = detailFields("format", record);
  const details = all.filter((f) => !LONG.includes(f.name) && f.name !== "logline");
  const highlights = pickFields(all, ["formatType", "targetPlatform", "episodeLength", "productionScale", "location", "lastActivityAt"]);

  const tabs: RecordTab[] = [
    { key: "overview", label: "Overview" },
    { key: "talent", label: "Talent", count: format.creators.length },
    { key: "people", label: "People", count: format.people.length },
    { key: "companies", label: "Companies", count: format.organizations.length },
    { key: "topics", label: "Topics", count: format.entityLinks.length },
    { key: "opportunities", label: "Opportunities", count: format.opportunities.length },
    { key: "activity", label: "Activity" },
  ];
  const tab = currentTab(sp, tabs);
  const autoLink = sp.link === "1";

  return (
    <div>
      <RecordHeader
        type="format" id={format.id} slug={format.slug} path={path} version={format.version}
        name={nameField("format", record)} typeLabel="Format" canEdit={canEdit} favorited={chrome.favorited}
        archived={format.archived} archivedReason={format.archivedReason} mergedInto={chrome.merged} duplicates={chrome.duplicates}
        status={{ type: "format", value: format.status }} editHref={`${path}/edit`}
        badges={<KindBadge kind="format" />}
        subtitle={<p className="mt-2 max-w-2xl text-[15px] italic text-charcoal"><InlineField type="format" id={format.id} field={fieldNamed(all, "logline")} canEdit={canEdit} placeholder="Add a logline…" /></p>}
        nav={<><RecordContext type="format" id={format.id} name={format.title} slug={format.slug} path={path} canEdit={canEdit} status={format.status} /><RecordStepper type="format" fallback={neighbors} /></>}
        actions={<AddToCollectionButton targetType="format" targetId={format.id} targetLabel={format.title} />}
        linkTargets={[{ key: "talent", label: "Talent" }, { key: "people", label: "People" }, { key: "companies", label: "Companies" }, { key: "topics", label: "Topics" }]}
      />
      {!format.archived && (
        <div className="-mt-2 mb-6 flex flex-wrap gap-2">
          <QuietTimer targetType="format" id={format.id} name={format.title} canEdit={canEdit} onTimer={onQuietTimer("format", format.status)} {...quietClock(format)} />
          <AirtableCard targetType="format" targetId={format.id} canEdit={canEdit} state={{ ...airtableState, syncedAt: airtableState.syncedAt?.toISOString() ?? null }} />
        </div>
      )}

      <RecordLayout details={<DetailsPanel type="format" id={format.id} fields={details} canEdit={canEdit} />}>
        <RecordTabs path={path} tabs={tabs} current={tab} />

        {tab === "overview" && (
          <>
            <Highlights type="format" id={format.id} fields={highlights} canEdit={canEdit} />
            <UpdatePanel user={user} targetType="format" targetId={format.id} name={format.title} path={path} recordType="format in development" />
            <Section title="Description">
              <InlineField type="format" id={format.id} field={fieldNamed(all, "description")} canEdit={canEdit} className="text-[15px] leading-relaxed" placeholder="What is this format? Add a description…" />
            </Section>
            {(format.episodeStructure || canEdit) && (
              <Section title="Episode Structure">
                <InlineField type="format" id={format.id} field={fieldNamed(all, "episodeStructure")} canEdit={canEdit} className="text-sm" placeholder="How does an episode run?" />
              </Section>
            )}
            {(format.sponsorFit || canEdit) && (
              <Section title="Sponsor Fit">
                <InlineField type="format" id={format.id} field={fieldNamed(all, "sponsorFit")} canEdit={canEdit} className="text-sm" placeholder="Which brands and categories fit?" />
              </Section>
            )}
            <Section title="Notes">
              <InlineField type="format" id={format.id} field={fieldNamed(all, "notes")} canEdit={canEdit} className="text-sm text-muted" placeholder="Add notes…" />
            </Section>
            <Section title="Sources">
              <SourceList canEdit={canEdit} targetType="format" targetId={format.id} sources={recordSources.map((rs) => ({ recordSourceId: rs.id, title: rs.source.title, url: rs.source.url, sourceType: rs.source.sourceType }))} />
            </Section>
            <Section title="Attachments">
              <AttachmentList canEdit={canEdit} targetType="format" targetId={format.id} attachments={attachments} blobReady={limits.blob} maxBytes={limits.bytes} />
            </Section>
          </>
        )}

        {tab === "talent" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Talent" columns={{ sub: "Headline", extra: "" }}
            rows={format.creators.map((cf) => ({
              id: cf.id, name: cf.creator.name, href: `/talent/${cf.creator.slug}`, sub: cf.creator.headline ?? undefined,
              extra: cf.isPrimary ? <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-deep">Primary</span> : null,
              removePayload: { kind: "creator_format", creatorId: cf.creatorId, formatId: format.id },
            }))}
            addConfig={{ template: { kind: "creator_format", formatId: format.id }, idField: "creatorId", lookupType: "creator", buttonLabel: "+ Attach talent" }}
            emptyMessage="No talent attached yet."
          />
        )}
        {tab === "people" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Person" columns={{ sub: "Company", role: "Role" }}
            rows={format.people.map((fp) => ({
              id: fp.id, name: fp.person.name, href: `/people/${fp.person.slug}`, sub: fp.person.organizations[0]?.organization.name ?? fp.person.title ?? undefined, role: labelFor(fp.role),
              removePayload: { kind: "format_person", formatId: format.id, personId: fp.personId, role: fp.role },
            }))}
            addConfig={{ template: { kind: "format_person", formatId: format.id }, idField: "personId", lookupType: "person", roleField: "role", roleOptions: PERSON_PROJECT_ROLES, createKind: "person", buttonLabel: "+ Add person" }}
            emptyMessage="No industry people on this yet — the execs, producers and reps involved."
          />
        )}
        {tab === "companies" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Company" columns={{ role: "Relationship" }}
            rows={format.organizations.map((fo) => ({
              id: fo.id, name: fo.organization.name, href: `/organizations/${fo.organization.slug}`, role: labelFor(fo.relationship),
              removePayload: { kind: "format_org", formatId: format.id, organizationId: fo.organizationId },
            }))}
            addConfig={{
              template: { kind: "format_org", formatId: format.id }, idField: "organizationId", lookupType: "organization", roleField: "relationship",
              roleOptions: [{ value: "target", label: "Target Buyer" }, { value: "sponsor_target", label: "Sponsor Target" }, { value: "partner", label: "Partner" }, { value: "associated", label: "Associated" }],
              createKind: "organization", buttonLabel: "+ Add company",
            }}
            emptyMessage="No companies linked."
          />
        )}
        {tab === "topics" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Topic" columns={{ sub: "Kind" }}
            rows={format.entityLinks.map((l) => ({
              id: l.id, name: l.entity.name, href: `/explore/${l.entity.kind}/${l.entity.slug}`, sub: labelFor(l.entity.kind),
              removePayload: { kind: "format_entity", formatId: format.id, entityId: l.entityId },
            }))}
            addConfig={{ template: { kind: "format_entity", formatId: format.id }, idField: "entityId", lookupType: "entity", createKind: "entity", lookupKind: "interest", buttonLabel: "+ Add topic" }}
            emptyMessage="No interests, sports or topics mapped yet."
          />
        )}
        {tab === "opportunities" && (
          <RelationTable
            canEdit={canEdit} title="Opportunity" columns={{ sub: "Status" }}
            rows={format.opportunities.map((o) => ({ id: o.id, name: o.opportunity.title, href: `/opportunities/${o.opportunity.slug}`, sub: labelFor(o.opportunity.status) }))}
            emptyMessage={<>No opportunities yet. Link this format from an <Link href="/opportunities" className="underline underline-offset-2">opportunity</Link>.</>}
          />
        )}
        {tab === "activity" && <RecordActivity type="format" id={format.id} />}
      </RecordLayout>

      <RecordFooter type="format" id={format.id} createdAt={format.createdAt} updatedAt={format.updatedAt} owner={format.owner?.name} />
    </div>
  );
}
