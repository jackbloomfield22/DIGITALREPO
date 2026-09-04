import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { movedTo } from "@/lib/conversions";
import { UpdatePanel } from "@/components/update-panel";
import { requireUser, hasRole } from "@/lib/auth";
import { Section } from "@/components/ui";
import { RowStatus } from "@/components/row-status";
import { ChannelIdeas } from "@/components/channel-ideas";
import { LinkChips } from "@/components/link-editor";
import { LINK_SPECS } from "@/lib/ingest/registry";
import { AttachmentList } from "@/components/attachments";
import { attachmentsFor, uploadLimit } from "@/lib/files";
import { compactNumber, formatDate, relativeTime, isStale } from "@/lib/format";
import { labelFor } from "@/lib/taxonomy";

const STALE_DAYS = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const channel = await db.channel.findUnique({ where: { slug }, select: { name: true } });
  return { title: channel?.name ?? "Channel" };
}

export default async function ChannelPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;
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
  // A page that was moved forwards to its new home; anything else archived is simply gone from here.
  if (channel.archived) {
    const to = movedTo(channel.archivedReason);
    if (to) redirect(to);
    notFound();
  }

  const [attachments, activity] = await Promise.all([
    attachmentsFor("channel", channel.id),
    db.auditLog.findMany({
      where: { targetType: "channel", targetId: channel.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, userName: true, action: true, field: true, newValue: true, createdAt: true },
    }),
  ]);

  const numbers = [
    { label: "Subscribers", value: channel.subscribers },
    { label: "Total views", value: channel.totalViews },
    { label: "Videos", value: channel.videoCount },
  ].filter((n) => n.value != null);

  return (
    <div className="max-w-4xl">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="kind-badge kind-format">YouTube Channel</span>
            <RowStatus type="channel" id={channel.id} status={channel.status} name={channel.name} canEdit={canEdit} />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{channel.name}</h1>
          <div className="mt-1 text-sm text-muted">
            {[
              channel.creator ? null : channel.handle,
              channel.cadence,
              channel.launchedAt ? `launched ${formatDate(channel.launchedAt)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {channel.url && (
            <a href={channel.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
              Open on YouTube
            </a>
          )}
          {canEdit && <Link href={`/youtube/${channel.slug}/edit`} className="btn btn-secondary btn-sm">Edit</Link>}
        </div>
      </div>

      <div className="mt-5 grid gap-x-10 gap-y-6 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0">
          <UpdatePanel
            user={user}
            targetType="channel"
            targetId={channel.id}
            name={channel.name}
            path={`/youtube/${channel.slug}`}
            recordType="YouTube channel"
            workspace="youtube"
          />
          {channel.premise && (
            <Section title="What it is">
              <p className="whitespace-pre-line text-sm text-charcoal">{channel.premise}</p>
            </Section>
          )}

          <Section title="Ideas">
            <ChannelIdeas
              channelId={channel.id}
              canEdit={canEdit}
              ideas={channel.ideas.map((i) => ({ id: i.id, title: i.title, status: i.status, notes: i.notes }))}
            />
          </Section>

          {channel.revenueModel && (
            <Section title="How it makes money">
              <p className="whitespace-pre-line text-sm text-charcoal">{channel.revenueModel}</p>
            </Section>
          )}

          <Section title="Companies">
            <LinkChips
              canEdit={canEdit}
              emptyMessage="No companies attached yet."
              items={channel.organizations.map((o) => ({
                key: o.id,
                label: o.organization.name,
                href: `/organizations/${o.organization.slug}`,
                sub: labelFor(o.relationship),
                removePayload: {
                  kind: "channel_org",
                  channelId: channel.id,
                  organizationId: o.organizationId,
                  relationship: o.relationship,
                },
              }))}
              addConfig={{
                template: { kind: "channel_org", channelId: channel.id },
                idField: "organizationId",
                lookupType: "organization",
                roleField: "relationship",
                roleOptions: LINK_SPECS.channel_org.roleVocab?.() ?? [],
                roleDefault: "production_partner",
                createKind: "organization",
                buttonLabel: "+ Add Company",
                placeholder: "Production partner, management, MCN, brand…",
              }}
            />
          </Section>

          <Section title="People">
            <LinkChips
              canEdit={canEdit}
              emptyMessage="Nobody attached yet."
              items={channel.people.map((p) => ({
                key: p.id,
                label: p.person.name,
                href: `/people/${p.person.slug}`,
                sub: [labelFor(p.relationship), p.person.title].filter(Boolean).join(" · "),
                removePayload: {
                  kind: "channel_person",
                  channelId: channel.id,
                  personId: p.personId,
                  relationship: p.relationship,
                },
              }))}
              addConfig={{
                template: { kind: "channel_person", channelId: channel.id },
                idField: "personId",
                lookupType: "person",
                roleField: "relationship",
                roleOptions: LINK_SPECS.channel_person.roleVocab?.() ?? [],
                roleDefault: "contact",
                createKind: "person",
                buttonLabel: "+ Add Person",
                placeholder: "Manager, agent, producer, editor…",
              }}
            />
          </Section>

          <Section title="Files">
            <AttachmentList
              canEdit={canEdit}
              targetType="channel"
              targetId={channel.id}
              attachments={attachments}
              blobReady={limits.blob}
              maxBytes={limits.bytes}
            />
          </Section>

          {channel.notes && (
            <Section title="Notes">
              <p className="whitespace-pre-line text-sm text-charcoal">{channel.notes}</p>
            </Section>
          )}
        </div>

        <aside className="space-y-4">
          {numbers.length > 0 && (
            <div className="card p-4">
              <div className="overline mb-2">The numbers</div>
              <dl className="space-y-1.5 text-sm">
                {numbers.map((n) => (
                  <div key={n.label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted">{n.label}</dt>
                    <dd className="tabular-nums font-semibold">{compactNumber(n.value!)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-faint">
                {channel.countUpdatedAt ? (
                  <span className={isStale(channel.countUpdatedAt, STALE_DAYS) ? "text-warn" : undefined}>
                    Checked {relativeTime(channel.countUpdatedAt)}
                  </span>
                ) : (
                  "Never checked"
                )}
              </p>
            </div>
          )}

          <div className="card p-4">
            <div className="overline mb-2">Who</div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Athlete</dt>
                <dd className="min-w-0 truncate text-right">
                  {channel.creator ? (
                    <Link href={`/talent/${channel.creator.slug}`} className="underline underline-offset-2 hover:text-accent">
                      {channel.creator.name}
                    </Link>
                  ) : (
                    <span className="text-faint">Not linked</span>
                  )}
                </dd>
              </div>
              {channel.handle && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">Handle</dt>
                  <dd className="truncate">{channel.handle}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Lead</dt>
                <dd className="truncate">{channel.owner?.name ?? <span className="text-faint">—</span>}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Last activity</dt>
                <dd>{channel.lastActivityAt ? formatDate(channel.lastActivityAt) : <span className="text-faint">—</span>}</dd>
              </div>
            </dl>
          </div>

          {activity.length > 0 && (
            <div className="card p-4">
              <div className="overline mb-2">Recent</div>
              <ul className="space-y-1 text-xs">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-muted">
                      <span className="text-charcoal">{a.userName}</span>{" "}
                      {a.field ?? a.action}
                      {a.newValue ? `: ${a.newValue}` : ""}
                    </span>
                    <span className="shrink-0 text-faint">{relativeTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
