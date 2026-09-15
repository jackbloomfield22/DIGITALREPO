import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { movedTo } from "@/lib/conversions";
import { UpdatePanel } from "@/components/update-panel";
import { RecordStepper } from "@/components/record-stepper";
import { RecordContext } from "@/components/record-context";
import { recordNeighbors } from "@/lib/neighbors";
import { requireUser, hasRole } from "@/lib/auth";
import { recordRecentView } from "@/lib/actions/misc";
import { Portrait, Section } from "@/components/ui";
import { AddToCollectionButton } from "@/components/action-buttons";
import { SourceList } from "@/components/sources-attachments";
import { labelFor, CREATOR_ORG_RELATIONSHIPS, PROJECT_ORG_RELATIONSHIPS, PERSON_ROLE_TYPES } from "@/lib/taxonomy";
import { LINK_SPECS } from "@/lib/ingest/registry";
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

export default async function OrganizationPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: RecordSearchParams }) {
  const user = await requireUser();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const org = await db.organization.findUnique({
    where: { slug },
    include: {
      projects: { include: { project: { select: { id: true, title: true, slug: true, projectType: true, premiereYear: true, status: true } } } },
      creators: { include: { creator: { select: { id: true, name: true, slug: true, imageUrl: true } } } },
      formats: { include: { format: { select: { id: true, title: true, slug: true, status: true } } } },
      people: { include: { person: { select: { id: true, name: true, slug: true, title: true } } } },
      opportunities: { include: { opportunity: { select: { id: true, title: true, slug: true, status: true } } } },
    },
  });
  if (!org) notFound();
  if (org.archived) {
    const to = movedTo(org.archivedReason);
    if (to) redirect(to);
  }

  const canEdit = hasRole(user, "EDITOR");
  const path = `/organizations/${org.slug}`;
  await recordRecentView(user.id, "organization", org.id);

  const [chrome, recordSources, projectTalent, reppedTalent, neighbors] = await Promise.all([
    recordChrome(user.id, "organization", org.id, org.name, org.archived),
    db.recordSource.findMany({ where: { targetType: "organization", targetId: org.id }, include: { source: true } }),
    db.creatorProjectCredit.findMany({
      where: { project: { organizations: { some: { organizationId: org.id } } } },
      include: { creator: { select: { id: true, name: true, slug: true, imageUrl: true } }, project: { select: { title: true, slug: true } } },
    }),
    db.creatorPerson.findMany({
      where: { person: { organizations: { some: { organizationId: org.id } } } },
      include: { creator: { select: { id: true, name: true, slug: true } }, person: { select: { name: true } } },
    }),
    recordNeighbors("organization", { id: org.id, name: org.name }),
  ]);

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

  const record = org as unknown as Record<string, unknown>;
  const all = detailFields("organization", record);
  const details = all.filter((f) => !LONG.includes(f.name));
  const highlights = pickFields(all, ["types", "location", "website"]);

  const tabs: RecordTab[] = [
    { key: "overview", label: "Overview" },
    { key: "projects", label: "Projects", count: org.projects.length },
    { key: "talent", label: "Talent", count: org.creators.length + viaProjects.size + viaRep.size },
    { key: "formats", label: "Formats", count: org.formats.length },
    { key: "people", label: "People", count: org.people.length },
    { key: "opportunities", label: "Opportunities", count: org.opportunities.length },
    { key: "activity", label: "Activity" },
  ];
  const tab = currentTab(sp, tabs);
  const autoLink = sp.link === "1";

  return (
    <div>
      <RecordHeader
        type="organization" id={org.id} slug={org.slug} path={path} version={org.version}
        name={nameField("organization", record)} typeLabel="Company" canEdit={canEdit} favorited={chrome.favorited}
        archived={org.archived} archivedReason={org.archivedReason} mergedInto={chrome.merged} duplicates={chrome.duplicates}
        editHref={`${path}/edit`}
        media={<Portrait name={org.name} imageUrl={org.imageUrl} className="h-20 w-20 shrink-0 rounded-lg" textClass="text-2xl" />}
        subtitle={
          <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted">
            <span>{org.types.map(labelFor).join(" · ") || "Company"}</span>
            {org.location && <span>{org.location}</span>}
            {org.website && <a href={org.website} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-accent-deep">Website ↗</a>}
          </div>
        }
        nav={<><RecordContext type="organization" id={org.id} name={org.name} slug={org.slug} path={path} canEdit={canEdit} status={null} /><RecordStepper type="organization" fallback={neighbors} /></>}
        actions={<AddToCollectionButton targetType="organization" targetId={org.id} targetLabel={org.name} />}
        linkTargets={[{ key: "projects", label: "Project" }, { key: "talent", label: "Talent" }, { key: "formats", label: "Format" }, { key: "people", label: "Person" }]}
      />

      <RecordLayout details={<>
        <DetailsPanel type="organization" id={org.id} fields={details} canEdit={canEdit} />
        <div className="card p-4">
          <div className="overline mb-2">At a glance</div>
          <ul className="space-y-1 text-sm">
            <li className="flex justify-between"><span className="text-muted">Projects</span><span className="font-semibold">{org.projects.length}</span></li>
            <li className="flex justify-between"><span className="text-muted">Talent (direct)</span><span className="font-semibold">{org.creators.length}</span></li>
            <li className="flex justify-between"><span className="text-muted">Talent (via projects)</span><span className="font-semibold">{viaProjects.size}</span></li>
            {viaRep.size > 0 && <li className="flex justify-between"><span className="text-muted">Represented talent</span><span className="font-semibold">{viaRep.size}</span></li>}
            <li className="flex justify-between"><span className="text-muted">Formats</span><span className="font-semibold">{org.formats.length}</span></li>
          </ul>
          <Link href={`/talent?f=company~is~${org.id}`} className="mt-3 inline-block text-xs underline underline-offset-2 hover:text-accent">All connected talent in the directory →</Link>
        </div>
      </>}>
        <RecordTabs path={path} tabs={tabs} current={tab} />

        {tab === "overview" && (
          <>
            <Highlights type="organization" id={org.id} fields={highlights} canEdit={canEdit} />
            <UpdatePanel user={user} targetType="organization" targetId={org.id} name={org.name} path={path} recordType="organization" />
            <Section title="Overview">
              <InlineField type="organization" id={org.id} field={fieldNamed(all, "description")} canEdit={canEdit} className="text-[15px] leading-relaxed" placeholder="What does this company do, and why does it matter to us?" />
            </Section>
            <Section title="Sources">
              <SourceList canEdit={canEdit} targetType="organization" targetId={org.id} sources={recordSources.map((rs) => ({ recordSourceId: rs.id, title: rs.source.title, url: rs.source.url, sourceType: rs.source.sourceType }))} />
            </Section>
            <Section title="Internal Notes">
              <InlineField type="organization" id={org.id} field={fieldNamed(all, "internalNotes")} canEdit={canEdit} className="text-sm text-muted" placeholder="Add internal notes…" />
            </Section>
          </>
        )}

        {tab === "projects" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Project" columns={{ sub: "Type · Year", role: "Relationship" }}
            rows={org.projects.map((po) => ({
              id: po.id, name: po.project.title, href: `/projects/${po.project.slug}`,
              sub: [labelFor(po.project.projectType), po.project.premiereYear].filter(Boolean).join(" · "), role: labelFor(po.relationship),
              removePayload: { kind: "project_org", projectId: po.projectId, organizationId: org.id, relationship: po.relationship },
            }))}
            addConfig={{ template: { kind: "project_org", organizationId: org.id }, idField: "projectId", lookupType: "project", roleField: "relationship", roleOptions: PROJECT_ORG_RELATIONSHIPS, createKind: "project", buttonLabel: "+ Add project" }}
            emptyMessage="No projects linked yet."
          />
        )}
        {tab === "talent" && (
          <div className="space-y-6">
            <div>
              <h3 className="overline mb-2">Direct relationships</h3>
              <RelationTable
                canEdit={canEdit} autoOpen={autoLink} title="Talent" columns={{ role: "Relationship" }}
                rows={org.creators.map((co) => ({
                  id: co.id, name: co.creator.name, href: `/talent/${co.creator.slug}`, role: [labelFor(co.relationship), co.status === "past" ? "past" : null].filter(Boolean).join(" · "),
                  removePayload: { kind: "creator_org", creatorId: co.creatorId, organizationId: org.id, relationship: co.relationship },
                }))}
                addConfig={{ template: { kind: "creator_org", organizationId: org.id }, idField: "creatorId", lookupType: "creator", roleField: "relationship", roleOptions: CREATOR_ORG_RELATIONSHIPS, buttonLabel: "+ Add talent" }}
                emptyMessage="No talent connected directly yet."
              />
            </div>
            {viaProjects.size > 0 && (
              <div>
                <h3 className="overline mb-2">Through projects</h3>
                <RelationTable canEdit={false} title="Talent" columns={{ sub: "Projects" }} rows={[...viaProjects.values()].map(({ creator, projects }) => ({ id: creator.id, name: creator.name, href: `/talent/${creator.slug}`, sub: [...projects].join(", ") }))} />
              </div>
            )}
            {viaRep.size > 0 && (
              <div>
                <h3 className="overline mb-2">Represented talent</h3>
                <RelationTable canEdit={false} title="Talent" columns={{ sub: "Via" }} rows={[...viaRep.values()].map(({ creator, reps }) => ({ id: creator.id, name: creator.name, href: `/talent/${creator.slug}`, sub: [...reps].join(", ") }))} />
              </div>
            )}
          </div>
        )}
        {tab === "formats" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Format" columns={{ sub: "Status", role: "Relationship" }}
            rows={org.formats.map((fo) => ({
              id: fo.id, name: fo.format.title, href: `/formats/${fo.format.slug}`, sub: labelFor(fo.format.status), role: labelFor(fo.relationship),
              removePayload: { kind: "format_org", formatId: fo.formatId, organizationId: org.id, relationship: fo.relationship },
            }))}
            addConfig={{ template: { kind: "format_org", organizationId: org.id }, idField: "formatId", lookupType: "format", roleField: "relationship", roleOptions: LINK_SPECS.format_org.roleVocab?.() ?? [], createKind: "format", buttonLabel: "+ Add format" }}
            emptyMessage="No formats in development connected."
          />
        )}
        {tab === "people" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Person" columns={{ sub: "Title", role: "Role" }}
            rows={org.people.map((po) => ({
              id: po.id, name: po.person.name, href: `/people/${po.person.slug}`, sub: po.person.title ?? undefined, role: po.role ? labelFor(po.role) : undefined,
              removePayload: { kind: "person_org", personId: po.personId, organizationId: org.id },
            }))}
            addConfig={{ template: { kind: "person_org", organizationId: org.id }, idField: "personId", lookupType: "person", roleField: "role", roleOptions: PERSON_ROLE_TYPES, createKind: "person", buttonLabel: "+ Add person" }}
            emptyMessage="No people mapped to this company."
          />
        )}
        {tab === "opportunities" && (
          <RelationTable
            canEdit={canEdit} title="Opportunity" columns={{ sub: "Status" }}
            rows={org.opportunities.map((o) => ({ id: o.id, name: o.opportunity.title, href: `/opportunities/${o.opportunity.slug}`, sub: labelFor(o.opportunity.status), removePayload: { kind: "opportunity_org", opportunityId: o.opportunityId, organizationId: org.id } }))}
            emptyMessage="No opportunities involve this company."
          />
        )}
        {tab === "activity" && <RecordActivity type="organization" id={org.id} />}
      </RecordLayout>

      <RecordFooter type="organization" id={org.id} createdAt={org.createdAt} updatedAt={org.updatedAt} />
    </div>
  );
}
