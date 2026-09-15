import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { movedTo } from "@/lib/conversions";
import { UpdatePanel } from "@/components/update-panel";
import { DeleteRecordButton } from "@/components/delete-record-button";
import { RecordStepper } from "@/components/record-stepper";
import { RecordContext } from "@/components/record-context";
import { recordNeighbors } from "@/lib/neighbors";

import { requireUser, hasRole } from "@/lib/auth";
import { recordRecentView } from "@/lib/actions/misc";
import { Portrait, Section } from "@/components/ui";
import { LinkChips } from "@/components/link-editor";
import { FavoriteButton, AddToCollectionButton } from "@/components/action-buttons";
import { SourceList } from "@/components/sources-attachments";
import { labelFor, CREATOR_ORG_RELATIONSHIPS, PROJECT_ORG_RELATIONSHIPS, PERSON_ROLE_TYPES } from "@/lib/taxonomy";
import { LINK_SPECS } from "@/lib/ingest/registry";
import { formatDate, relativeTime } from "@/lib/format";

export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const org = await db.organization.findUnique({
    where: { slug },
    include: {
      projects: { include: { project: { select: { id: true, title: true, slug: true, projectType: true, premiereYear: true, status: true } } } },
      creators: { include: { creator: { select: { id: true, name: true, slug: true, imageUrl: true } } } },
      formats: { include: { format: { select: { id: true, title: true, slug: true, status: true } } } },
      people: { include: { person: { select: { id: true, name: true, slug: true, title: true } } } },
      opportunities: { include: { opportunity: { select: { title: true, slug: true, status: true } } } },
    },
  });
  if (!org) notFound();
  // A page that was moved forwards to its new home; anything else archived is simply gone from here.
  if (org.archived) {
    const to = movedTo(org.archivedReason);
    if (to) redirect(to);
    notFound();
  }

  const canEdit = hasRole(user, "EDITOR");
  await recordRecentView(user.id, "organization", org.id);

  const [favorite, recordSources, projectTalent, reppedTalent] = await Promise.all([
    db.favorite.findUnique({
      where: { userId_targetType_targetId: { userId: user.id, targetType: "organization", targetId: org.id } },
    }),
    db.recordSource.findMany({ where: { targetType: "organization", targetId: org.id }, include: { source: true } }),
    // Creators connected through this org's projects
    db.creatorProjectCredit.findMany({
      where: { project: { organizations: { some: { organizationId: org.id } } } },
      include: {
        creator: { select: { id: true, name: true, slug: true, imageUrl: true } },
        project: { select: { title: true, slug: true } },
      },
    }),
    // Creators repped by people at this org (for agencies/management)
    db.creatorPerson.findMany({
      where: { person: { organizations: { some: { organizationId: org.id } } } },
      include: {
        creator: { select: { id: true, name: true, slug: true } },
        person: { select: { name: true } },
      },
    }),
  ]);

  const directIds = new Set(org.creators.map((c) => c.creatorId));
  const viaProjects = new Map<string, { creator: (typeof projectTalent)[number]["creator"]; projects: Set<string> }>();
  for (const t of projectTalent) {
    const e = viaProjects.get(t.creatorId) ?? { creator: t.creator, projects: new Set() };
    e.projects.add(t.project.title);
    viaProjects.set(t.creatorId, e);
  }
  const viaRep = new Map<string, { creator: (typeof reppedTalent)[number]["creator"]; reps: Set<string> }>();
  for (const r of reppedTalent) {
    const e = viaRep.get(r.creatorId) ?? { creator: r.creator, reps: new Set() };
    e.reps.add(r.person.name);
    viaRep.set(r.creatorId, e);
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          <Portrait name={org.name} imageUrl={org.imageUrl} className="h-20 w-20 shrink-0 rounded-lg" textClass="text-2xl" />
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{org.name}</h1>
            <div className="mt-1 text-sm text-muted">{org.types.map(labelFor).join(" · ") || "Organization"}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted">
              {org.location && <span>{org.location}</span>}
              {org.website && (
                <a href={org.website} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-accent-deep">
                  Website ↗
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RecordContext type="organization" id={org.id} name={org.name} slug={org.slug} path={`/organizations/${org.slug}`} canEdit={canEdit} status={null} />
          <RecordStepper type="organization" fallback={await recordNeighbors("organization", { id: org.id, name: org.name })} />
          {canEdit && (
            <span className="flex gap-2">
              <Link href={`/organizations/${org.slug}/edit`} className="btn btn-primary btn-sm">Edit</Link>
              <DeleteRecordButton targetType="organization" id={org.id} label={org.name} />
            </span>
          )}
          <FavoriteButton targetType="organization" targetId={org.id} favorited={!!favorite} />
          <AddToCollectionButton targetType="organization" targetId={org.id} targetLabel={org.name} />
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <UpdatePanel
            user={user}
            targetType="organization"
            targetId={org.id}
            name={org.name}
            path={`/organizations/${org.slug}`}
            recordType="organization"
          />
          {org.description && (
            <Section title="Overview">
              <p className="whitespace-pre-line text-[15px] leading-relaxed">{org.description}</p>
            </Section>
          )}

          <Section title="Projects">
            <LinkChips
              canEdit={canEdit}
              items={org.projects.map((po) => ({
                key: po.id,
                label: po.project.title,
                sub: [labelFor(po.relationship), labelFor(po.project.projectType), po.project.premiereYear].filter(Boolean).join(" · "),
                href: `/projects/${po.project.slug}`,
                removePayload: { kind: "project_org", projectId: po.projectId, organizationId: org.id, relationship: po.relationship },
              }))}
              addConfig={{
                template: { kind: "project_org", organizationId: org.id },
                idField: "projectId",
                lookupType: "project",
                roleField: "relationship",
                roleOptions: PROJECT_ORG_RELATIONSHIPS,
                createKind: "project",
                buttonLabel: "+ Add Project",
              }}
              emptyMessage="No projects linked yet."
            />
          </Section>

          <Section title="Talent">
            <div className="mb-4">
              {(org.creators.length > 0 || viaProjects.size > 0 || viaRep.size > 0) && (
                <div className="mb-1.5 text-xs font-semibold text-muted">Direct relationships</div>
              )}
              <LinkChips
                canEdit={canEdit}
                items={org.creators.map((co) => ({
                  key: co.id,
                  label: co.creator.name,
                  sub: [labelFor(co.relationship), co.status === "past" ? "past" : null].filter(Boolean).join(" · "),
                  href: `/talent/${co.creator.slug}`,
                  removePayload: { kind: "creator_org", creatorId: co.creatorId, organizationId: org.id, relationship: co.relationship },
                }))}
                addConfig={{
                  template: { kind: "creator_org", organizationId: org.id },
                  idField: "creatorId",
                  lookupType: "creator",
                  roleField: "relationship",
                  roleOptions: CREATOR_ORG_RELATIONSHIPS,
                  buttonLabel: "+ Add Talent",
                }}
                emptyMessage="No talent connected yet."
              />
            </div>
            {viaProjects.size > 0 && (
              <div className="mb-4">
                <div className="mb-1.5 text-xs font-semibold text-muted">Through projects</div>
                <div className="space-y-1.5">
                  {[...viaProjects.values()].map(({ creator, projects }) => (
                    <div key={creator.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                      <Link href={`/talent/${creator.slug}`} className="font-medium hover:text-accent-deep hover:underline">
                        {creator.name}
                      </Link>
                      <span className="text-xs text-muted">{[...projects].join(", ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {viaRep.size > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-semibold text-muted">Represented talent</div>
                <div className="space-y-1.5">
                  {[...viaRep.values()].map(({ creator, reps }) => (
                    <div key={creator.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                      <Link href={`/talent/${creator.slug}`} className="font-medium hover:text-accent-deep hover:underline">
                        {creator.name}
                      </Link>
                      <span className="text-xs text-muted">via {[...reps].join(", ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section title="4.4.Forty Formats">
            <LinkChips
              canEdit={canEdit}
              items={org.formats.map((fo) => ({
                key: fo.id,
                label: fo.format.title,
                sub: [labelFor(fo.relationship), labelFor(fo.format.status)].filter(Boolean).join(" · "),
                href: `/formats/${fo.format.slug}`,
                removePayload: { kind: "format_org", formatId: fo.formatId, organizationId: org.id, relationship: fo.relationship },
              }))}
              addConfig={{
                template: { kind: "format_org", organizationId: org.id },
                idField: "formatId",
                lookupType: "format",
                roleField: "relationship",
                roleOptions: LINK_SPECS.format_org.roleVocab?.() ?? [],
                createKind: "format",
                buttonLabel: "+ Add Format",
              }}
              emptyMessage="No internal formats connected."
            />
          </Section>

          <Section title="Industry People">
            <LinkChips
              canEdit={canEdit}
              items={org.people.map((po) => ({
                key: po.id,
                label: po.person.name,
                sub: [po.role ? labelFor(po.role) : null, po.person.title].filter(Boolean).join(" · ") || undefined,
                href: `/people/${po.person.slug}`,
                removePayload: { kind: "person_org", personId: po.personId, organizationId: org.id },
              }))}
              addConfig={{
                template: { kind: "person_org", organizationId: org.id },
                idField: "personId",
                lookupType: "person",
                roleField: "role",
                roleOptions: PERSON_ROLE_TYPES,
                createKind: "person",
                buttonLabel: "+ Add Person",
              }}
              emptyMessage="No people mapped to this organization."
            />
          </Section>

          <Section title="Sources">
            <SourceList
              canEdit={canEdit}
              targetType="organization"
              targetId={org.id}
              sources={recordSources.map((rs) => ({
                recordSourceId: rs.id, title: rs.source.title, url: rs.source.url, sourceType: rs.source.sourceType,
              }))}
            />
          </Section>

          {(org.internalNotes || canEdit) && (
            <Section title="Internal Notes">
              {org.internalNotes ? (
                <p className="whitespace-pre-line text-sm text-muted">{org.internalNotes}</p>
              ) : (
                <p className="text-sm text-faint">No internal notes.</p>
              )}
            </Section>
          )}
        </div>

        <aside className="min-w-0 space-y-6">
          <div className="card p-4">
            <div className="overline mb-2">At a Glance</div>
            <ul className="space-y-1 text-sm">
              <li className="flex justify-between"><span className="text-muted">Projects</span><span className="font-semibold">{org.projects.length}</span></li>
              <li className="flex justify-between"><span className="text-muted">Talent (direct)</span><span className="font-semibold">{directIds.size}</span></li>
              <li className="flex justify-between"><span className="text-muted">Talent (via projects)</span><span className="font-semibold">{viaProjects.size}</span></li>
              {viaRep.size > 0 && (
                <li className="flex justify-between"><span className="text-muted">Represented talent</span><span className="font-semibold">{viaRep.size}</span></li>
              )}
              <li className="flex justify-between"><span className="text-muted">Formats</span><span className="font-semibold">{org.formats.length}</span></li>
            </ul>
            <Link
              href={`/talent?org=${org.id}`}
              className="mt-3 inline-block text-xs underline underline-offset-2 hover:text-accent"
            >
              View all connected talent in directory →
            </Link>
          </div>

          {org.opportunities.length > 0 && (
            <div className="card p-4">
              <div className="overline mb-2">Opportunities</div>
              <ul className="space-y-1 text-sm">
                {org.opportunities.map((o) => (
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
              <li className="flex justify-between"><span>Updated</span><span>{relativeTime(org.updatedAt)}</span></li>
              <li className="flex justify-between"><span>Added</span><span>{formatDate(org.createdAt)}</span></li>
            </ul>
            <Link href={`/activity?type=organization&id=${org.id}`} className="mt-2 inline-block text-xs underline underline-offset-2 hover:text-accent">
              History →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
