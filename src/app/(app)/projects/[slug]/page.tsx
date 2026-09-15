import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { movedTo } from "@/lib/conversions";
import { UpdatePanel } from "@/components/update-panel";
import { requireUser, hasRole } from "@/lib/auth";
import { recordRecentView } from "@/lib/actions/misc";
import { findRelatedProjects } from "@/lib/related";
import { KindBadge, Portrait, Section } from "@/components/ui";
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
import { PERSON_PROJECT_ROLES, PROJECT_ORG_RELATIONSHIPS, PROJECT_ROLES, labelFor } from "@/lib/taxonomy";
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

const LONG = ["description", "internalNotes"];

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: RecordSearchParams }) {
  const user = await requireUser();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const project = await db.project.findUnique({
    where: { slug },
    include: {
      credits: { include: { creator: { select: { id: true, name: true, slug: true, imageUrl: true } } } },
      organizations: { include: { organization: true } },
      entityLinks: { include: { entity: true } },
      people: { include: { person: { select: { id: true, name: true, slug: true, title: true, organizations: { take: 1, include: { organization: { select: { name: true } } } } } } } },
      opportunities: { include: { opportunity: { select: { id: true, title: true, slug: true, status: true } } } },
    },
  });
  if (!project) notFound();
  if (project.archived) {
    const to = movedTo(project.archivedReason);
    if (to) redirect(to);
  }

  const canEdit = hasRole(user, "EDITOR");
  const limits = uploadLimit();
  const path = `/projects/${project.slug}`;
  await recordRecentView(user.id, "project", project.id);

  const [chrome, recordSources, attachments, related, airtableState, neighbors] = await Promise.all([
    recordChrome(user.id, "project", project.id, project.title, project.archived),
    db.recordSource.findMany({ where: { targetType: "project", targetId: project.id }, include: { source: true } }),
    attachmentsFor("project", project.id),
    findRelatedProjects(project.id),
    airtableStateFor("project", project.id),
    recordNeighbors("project", { id: project.id, name: project.title }),
  ]);

  const record = project as unknown as Record<string, unknown>;
  const all = detailFields("project", record);
  const details = all.filter((f) => !LONG.includes(f.name) && f.name !== "logline");
  const highlights = pickFields(all, ["projectType", "premiereYear", "endYear", "seasons", "episodes", "runtimeMinutes", "country"]).filter((f) => f.value != null).length
    ? pickFields(all, ["projectType", "premiereYear", "seasons", "episodes", "runtimeMinutes", "country"])
    : pickFields(all, ["projectType", "premiereYear", "country"]);

  const links = [
    { label: "Trailer", url: project.trailerUrl }, { label: "Official page", url: project.officialUrl },
    { label: "IMDb", url: project.imdbUrl }, { label: "YouTube", url: project.youtubeUrl },
  ].filter((l) => l.url);

  const talentMap = new Map<string, { creator: (typeof project.credits)[number]["creator"]; roles: { role: string; id: string }[] }>();
  for (const c of project.credits) {
    const e = talentMap.get(c.creatorId) ?? { creator: c.creator, roles: [] };
    e.roles.push({ role: c.role, id: c.id });
    talentMap.set(c.creatorId, e);
  }

  const tabs: RecordTab[] = [
    { key: "overview", label: "Overview" },
    { key: "talent", label: "Talent", count: talentMap.size },
    { key: "companies", label: "Companies", count: project.organizations.length },
    { key: "people", label: "People", count: project.people.length },
    { key: "topics", label: "Topics", count: project.entityLinks.length },
    { key: "opportunities", label: "Opportunities", count: project.opportunities.length },
    { key: "activity", label: "Activity" },
  ];
  const tab = currentTab(sp, tabs);
  const autoLink = sp.link === "1";

  return (
    <div>
      <RecordHeader
        type="project" id={project.id} slug={project.slug} path={path} version={project.version}
        name={nameField("project", record)} typeLabel="Project" canEdit={canEdit} favorited={chrome.favorited}
        archived={project.archived} archivedReason={project.archivedReason} mergedInto={chrome.merged} duplicates={chrome.duplicates}
        status={{ type: "project", value: project.status }} editHref={`${path}/edit`}
        badges={<KindBadge kind="project" />}
        media={<Portrait name={project.title} imageUrl={project.imageUrl} className="h-24 w-24 shrink-0 rounded-lg sm:h-28 sm:w-28" textClass="text-3xl" />}
        subtitle={<p className="mt-2 max-w-2xl text-sm italic text-charcoal"><InlineField type="project" id={project.id} field={fieldNamed(all, "logline")} canEdit={canEdit} placeholder="Add a logline…" /></p>}
        nav={<><RecordContext type="project" id={project.id} name={project.title} slug={project.slug} path={path} canEdit={canEdit} status={project.status} /><RecordStepper type="project" fallback={neighbors} /></>}
        actions={<AddToCollectionButton targetType="project" targetId={project.id} targetLabel={project.title} />}
        linkTargets={[{ key: "talent", label: "Talent" }, { key: "companies", label: "Companies" }, { key: "people", label: "People" }, { key: "topics", label: "Topics" }]}
      />
      {!project.archived && (
        <div className="-mt-2 mb-6 flex flex-wrap gap-2">
          <QuietTimer targetType="project" id={project.id} name={project.title} canEdit={canEdit} onTimer={onQuietTimer("project", project.status)} {...quietClock(project)} />
          <AirtableCard targetType="project" targetId={project.id} canEdit={canEdit} state={{ ...airtableState, syncedAt: airtableState.syncedAt?.toISOString() ?? null }} />
        </div>
      )}

      <RecordLayout details={<>
        <DetailsPanel type="project" id={project.id} fields={details} canEdit={canEdit} />
        {related.length > 0 && (
          <div className="card p-4">
            <div className="overline mb-2">Related projects</div>
            <ul className="space-y-2 text-sm">
              {related.map((r) => (
                <li key={r.id}>
                  <Link href={`/projects/${r.slug}`} className="font-medium hover:text-accent-deep hover:underline">{r.title}</Link>
                  <div className="text-xs text-muted">{r.reasons.join(" · ")}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </>}>
        <RecordTabs path={path} tabs={tabs} current={tab} />

        {tab === "overview" && (
          <>
            <Highlights type="project" id={project.id} fields={highlights} canEdit={canEdit} />
            <UpdatePanel user={user} targetType="project" targetId={project.id} name={project.title} path={path} recordType="project" />
            <Section title="Description">
              <InlineField type="project" id={project.id} field={fieldNamed(all, "description")} canEdit={canEdit} className="text-sm leading-relaxed" placeholder="What is this project? Add a description…" />
            </Section>
            {links.length > 0 && (
              <Section title="Links">
                <div className="flex flex-wrap gap-2">
                  {links.map((l) => <a key={l.label} className="chip" href={l.url!} target="_blank" rel="noreferrer">{l.label} ↗</a>)}
                </div>
              </Section>
            )}
            <Section title="Sources">
              <SourceList canEdit={canEdit} targetType="project" targetId={project.id} sources={recordSources.map((rs) => ({ recordSourceId: rs.id, title: rs.source.title, url: rs.source.url, sourceType: rs.source.sourceType }))} />
            </Section>
            <Section title="Attachments">
              <AttachmentList canEdit={canEdit} targetType="project" targetId={project.id} attachments={attachments} blobReady={limits.blob} maxBytes={limits.bytes} />
            </Section>
            <Section title="Internal Notes">
              <InlineField type="project" id={project.id} field={fieldNamed(all, "internalNotes")} canEdit={canEdit} className="text-sm text-muted" placeholder="Add internal notes…" />
            </Section>
          </>
        )}

        {tab === "talent" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Talent" columns={{ role: "Roles" }}
            rows={[...talentMap.values()].map(({ creator, roles }) => ({
              id: creator.id, name: creator.name, href: `/talent/${creator.slug}`,
              role: roles.map((r) => labelFor(r.role)).join(", "),
              removePayload: roles.length === 1 ? { kind: "creator_project", creatorId: creator.id, projectId: project.id, role: roles[0].role } : undefined,
              extra: roles.length > 1 && canEdit ? <span className="text-xs text-faint">Remove roles from the talent page</span> : null,
            }))}
            addConfig={{ template: { kind: "creator_project", projectId: project.id }, idField: "creatorId", lookupType: "creator", roleField: "role", roleOptions: PROJECT_ROLES, buttonLabel: "+ Add talent" }}
            emptyMessage="No talent linked yet."
          />
        )}
        {tab === "companies" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Company" columns={{ role: "Relationship" }}
            rows={project.organizations.map((o) => ({
              id: o.id, name: o.organization.name, href: `/organizations/${o.organization.slug}`, role: labelFor(o.relationship),
              removePayload: { kind: "project_org", projectId: project.id, organizationId: o.organizationId, relationship: o.relationship },
            }))}
            addConfig={{ template: { kind: "project_org", projectId: project.id }, idField: "organizationId", lookupType: "organization", roleField: "relationship", roleOptions: PROJECT_ORG_RELATIONSHIPS, createKind: "organization", buttonLabel: "+ Add company" }}
            emptyMessage="No production companies, networks, platforms or brands linked yet."
          />
        )}
        {tab === "people" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Person" columns={{ sub: "Company", role: "Role" }}
            rows={project.people.map((pp) => ({
              id: pp.id, name: pp.person.name, href: `/people/${pp.person.slug}`, sub: pp.person.organizations[0]?.organization.name ?? pp.person.title ?? undefined, role: labelFor(pp.role),
              removePayload: { kind: "project_person", projectId: project.id, personId: pp.personId, role: pp.role },
            }))}
            addConfig={{ template: { kind: "project_person", projectId: project.id }, idField: "personId", lookupType: "person", roleField: "role", roleOptions: PERSON_PROJECT_ROLES, createKind: "person", buttonLabel: "+ Add credit" }}
            emptyMessage="No industry credits recorded."
          />
        )}
        {tab === "topics" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Topic" columns={{ sub: "Kind" }}
            rows={project.entityLinks.map((l) => ({
              id: l.id, name: l.entity.name, href: `/explore/${l.entity.kind}/${l.entity.slug}`, sub: labelFor(l.entity.kind),
              removePayload: { kind: "project_entity", projectId: project.id, entityId: l.entityId },
            }))}
            addConfig={{ template: { kind: "project_entity", projectId: project.id }, idField: "entityId", lookupType: "entity", createKind: "entity", lookupKind: "vertical", buttonLabel: "+ Add topic" }}
            emptyMessage="No topics or genres tagged."
          />
        )}
        {tab === "opportunities" && (
          <RelationTable
            canEdit={canEdit} title="Opportunity" columns={{ sub: "Status" }}
            rows={project.opportunities.map((o) => ({ id: o.id, name: o.opportunity.title, href: `/opportunities/${o.opportunity.slug}`, sub: labelFor(o.opportunity.status) }))}
            emptyMessage="No opportunities reference this project."
          />
        )}
        {tab === "activity" && <RecordActivity type="project" id={project.id} />}
      </RecordLayout>

      <RecordFooter type="project" id={project.id} createdAt={project.createdAt} updatedAt={project.updatedAt} />
    </div>
  );
}
