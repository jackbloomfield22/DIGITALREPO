import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { movedTo } from "@/lib/conversions";
import { UpdatePanel } from "@/components/update-panel";
import { requireUser, hasRole } from "@/lib/auth";
import { recordRecentView } from "@/lib/actions/misc";
import { Section } from "@/components/ui";
import { ChannelIdeas } from "@/components/channel-ideas";
import { LINK_SPECS } from "@/lib/ingest/registry";
import { AttachmentList } from "@/components/attachments";
import { attachmentsFor, uploadLimit } from "@/lib/files";
import { formatDate, relativeTime, isStale } from "@/lib/format";
import { labelFor } from "@/lib/taxonomy";
import { RecordStepper } from "@/components/record-stepper";
import { RecordContext } from "@/components/record-context";
import { recordNeighbors } from "@/lib/neighbors";
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

const STALE_DAYS = 60;
const LONG = ["premise", "revenueModel", "notes", "ideas"];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const channel = await db.channel.findUnique({ where: { slug }, select: { name: true } });
  return { title: channel?.name ?? "Channel" };
}

export default async function ChannelPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: RecordSearchParams }) {
  const user = await requireUser();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const canEdit = hasRole(user, "EDITOR");
  const limits = uploadLimit();

  const channel = await db.channel.findUnique({
    where: { slug },
    include: {
      creator: { select: { name: true, slug: true, headline: true } },
      owner: { select: { name: true } },
      ideas: { orderBy: { sortOrder: "asc" } },
      organizations: { include: { organization: { select: { name: true, slug: true } } } },
      people: { include: { person: { select: { name: true, slug: true, title: true } } } },
    },
  });
  if (!channel) notFound();
  if (channel.archived) {
    const to = movedTo(channel.archivedReason);
    if (to) redirect(to);
  }
  const path = `/youtube/${channel.slug}`;
  await recordRecentView(user.id, "channel", channel.id);

  const [attachments, chrome, neighbors] = await Promise.all([
    attachmentsFor("channel", channel.id),
    recordChrome(user.id, "channel", channel.id, channel.name, channel.archived),
    recordNeighbors("channel", { id: channel.id, name: channel.name }),
  ]);

  const record = channel as unknown as Record<string, unknown>;
  const all = detailFields("channel", record);
  const details = all.filter((f) => !LONG.includes(f.name));
  const highlights = pickFields(all, ["subscribers", "totalViews", "videoCount", "cadence", "launchedAt", "lastActivityAt"]);

  const tabs: RecordTab[] = [
    { key: "overview", label: "Overview" },
    { key: "ideas", label: "Ideas", count: channel.ideas.length },
    { key: "companies", label: "Companies", count: channel.organizations.length },
    { key: "people", label: "People", count: channel.people.length },
    { key: "activity", label: "Activity" },
  ];
  const tab = currentTab(sp, tabs);
  const autoLink = sp.link === "1";

  return (
    <div>
      <RecordHeader
        type="channel" id={channel.id} slug={channel.slug} path={path} version={channel.version}
        name={nameField("channel", record)} typeLabel="YouTube channel" canEdit={canEdit} favorited={chrome.favorited}
        archived={channel.archived} archivedReason={channel.archivedReason} mergedInto={chrome.merged} mergeable={false}
        status={{ type: "channel", value: channel.status }} editHref={`${path}/edit`}
        subtitle={
          <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted">
            {channel.creator ? <Link href={`/talent/${channel.creator.slug}`} className="underline underline-offset-2 hover:text-accent">{channel.creator.name}</Link> : channel.handle && <span>{channel.handle}</span>}
            {channel.cadence && <span>{channel.cadence}</span>}
            {channel.launchedAt && <span>launched {formatDate(channel.launchedAt)}</span>}
            {channel.countUpdatedAt && <span className={isStale(channel.countUpdatedAt, STALE_DAYS) ? "text-warn" : undefined}>numbers checked {relativeTime(channel.countUpdatedAt)}</span>}
          </div>
        }
        nav={<><RecordContext type="channel" id={channel.id} name={channel.name} slug={channel.slug} path={path} canEdit={canEdit} status={channel.status} /><RecordStepper type="channel" fallback={neighbors} /></>}
        actions={channel.url ? <a href={channel.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">Open on YouTube</a> : null}
        linkTargets={[{ key: "companies", label: "Company" }, { key: "people", label: "Person" }]}
      />

      <RecordLayout details={<>
        <DetailsPanel type="channel" id={channel.id} fields={details} canEdit={canEdit} />
        <div className="card p-4">
          <div className="overline mb-2">Who</div>
          <dl className="space-y-1.5 text-sm">
            <div className="flex items-baseline justify-between gap-3"><dt className="text-muted">Athlete</dt><dd className="min-w-0 truncate text-right">{channel.creator ? <Link href={`/talent/${channel.creator.slug}`} className="underline underline-offset-2 hover:text-accent">{channel.creator.name}</Link> : <span className="text-faint">Not linked</span>}</dd></div>
            <div className="flex items-baseline justify-between gap-3"><dt className="text-muted">Lead</dt><dd className="truncate">{channel.owner?.name ?? <span className="text-faint">—</span>}</dd></div>
          </dl>
        </div>
      </>}>
        <RecordTabs path={path} tabs={tabs} current={tab} />

        {tab === "overview" && (
          <>
            <Highlights type="channel" id={channel.id} fields={highlights} canEdit={canEdit} />
            <UpdatePanel user={user} targetType="channel" targetId={channel.id} name={channel.name} path={path} recordType="YouTube channel" workspace="youtube" />
            <Section title="What it is">
              <InlineField type="channel" id={channel.id} field={fieldNamed(all, "premise")} canEdit={canEdit} className="text-sm text-charcoal" placeholder="What is this channel?" />
            </Section>
            <Section title="How it makes money">
              <InlineField type="channel" id={channel.id} field={fieldNamed(all, "revenueModel")} canEdit={canEdit} className="text-sm text-charcoal" placeholder="Sponsorship, AdSense, merch…" />
            </Section>
            <Section title="Files">
              <AttachmentList canEdit={canEdit} targetType="channel" targetId={channel.id} attachments={attachments} blobReady={limits.blob} maxBytes={limits.bytes} />
            </Section>
            <Section title="Notes">
              <InlineField type="channel" id={channel.id} field={fieldNamed(all, "notes")} canEdit={canEdit} className="text-sm text-charcoal" placeholder="Add notes…" />
            </Section>
          </>
        )}
        {tab === "ideas" && (
          <ChannelIdeas channelId={channel.id} canEdit={canEdit} ideas={channel.ideas.map((i) => ({ id: i.id, title: i.title, status: i.status, notes: i.notes }))} />
        )}
        {tab === "companies" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Company" columns={{ role: "Relationship" }}
            rows={channel.organizations.map((o) => ({ id: o.id, name: o.organization.name, href: `/organizations/${o.organization.slug}`, role: labelFor(o.relationship), removePayload: { kind: "channel_org", channelId: channel.id, organizationId: o.organizationId, relationship: o.relationship } }))}
            addConfig={{ template: { kind: "channel_org", channelId: channel.id }, idField: "organizationId", lookupType: "organization", roleField: "relationship", roleOptions: LINK_SPECS.channel_org.roleVocab?.() ?? [], roleDefault: "production_partner", createKind: "organization", buttonLabel: "+ Add company", placeholder: "Production partner, management, MCN, brand…" }}
            emptyMessage="No companies attached yet."
          />
        )}
        {tab === "people" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Person" columns={{ sub: "Title", role: "Relationship" }}
            rows={channel.people.map((p) => ({ id: p.id, name: p.person.name, href: `/people/${p.person.slug}`, sub: p.person.title ?? undefined, role: labelFor(p.relationship), removePayload: { kind: "channel_person", channelId: channel.id, personId: p.personId, relationship: p.relationship } }))}
            addConfig={{ template: { kind: "channel_person", channelId: channel.id }, idField: "personId", lookupType: "person", roleField: "relationship", roleOptions: LINK_SPECS.channel_person.roleVocab?.() ?? [], roleDefault: "contact", createKind: "person", buttonLabel: "+ Add person", placeholder: "Manager, agent, producer, editor…" }}
            emptyMessage="Nobody attached yet."
          />
        )}
        {tab === "activity" && <RecordActivity type="channel" id={channel.id} />}
      </RecordLayout>

      <RecordFooter type="channel" id={channel.id} createdAt={channel.createdAt} updatedAt={channel.updatedAt} owner={channel.owner?.name} />
    </div>
  );
}
