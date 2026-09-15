import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { movedTo } from "@/lib/conversions";
import { UpdatePanel } from "@/components/update-panel";
import { RecordStepper } from "@/components/record-stepper";
import { RecordContext } from "@/components/record-context";
import { recordNeighbors } from "@/lib/neighbors";
import { requireUser, hasRole } from "@/lib/auth";
import { recordRecentView } from "@/lib/actions/misc";
import { Section } from "@/components/ui";
import { labelFor, CREATOR_PERSON_RELATIONSHIPS, PERSON_ROLE_TYPES } from "@/lib/taxonomy";
import { RecordHeader } from "@/components/record-header";
import { VerifyButton } from "@/components/verify-button";
import { RecordLayout } from "@/components/record-layout";
import { DetailsPanel } from "@/components/details-panel";
import { Highlights } from "@/components/highlights";
import { InlineField } from "@/components/inline-field";
import { RecordTabs, currentTab, type RecordTab } from "@/components/record-tabs";
import { RecordActivity } from "@/components/record-activity";
import { RecordFooter } from "@/components/record-footer";
import { RelationTable } from "@/components/relation-table";
import { detailFields, fieldNamed, nameField, pickFields } from "@/lib/record-fields";
import { formatDate, isStale } from "@/lib/format";
import { recordChrome, type RecordSearchParams } from "@/lib/record-page";
import { customDetailFields } from "@/lib/custom-fields";
import { VERIFY_DAYS } from "@/lib/health";

export default async function PersonPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: RecordSearchParams }) {
  const user = await requireUser();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const person = await db.industryPerson.findUnique({
    where: { slug },
    include: {
      owner: { select: { name: true } },
      organizations: { include: { organization: { select: { id: true, name: true, slug: true } } } },
      creators: { include: { creator: { select: { id: true, name: true, slug: true, imageUrl: true } } } },
      projects: { include: { project: { select: { id: true, title: true, slug: true } } } },
      formats: { include: { format: { select: { id: true, title: true, slug: true, status: true } } } },
    },
  });
  if (!person) notFound();
  if (person.archived) {
    const to = movedTo(person.archivedReason);
    if (to) redirect(to);
  }

  const canEdit = hasRole(user, "EDITOR");
  const path = `/people/${person.slug}`;
  await recordRecentView(user.id, "person", person.id);
  const [chrome, neighbors] = await Promise.all([
    recordChrome(user.id, "person", person.id, person.name, person.archived),
    recordNeighbors("person", { id: person.id, name: person.name }),
  ]);

  const record = person as unknown as Record<string, unknown>;
  const all = detailFields("person", record);
  // Fields added under Settings → Fields sit below the built-in ones.
  const unverified = isStale(person.verifiedAt, VERIFY_DAYS);
  const custom = await customDetailFields("person", person.custom);
  const details = all.filter((f) => f.name !== "notes");
  const highlights = pickFields(all, ["title", "roleType", "email", "phone", "contactUrl", "assistantName"]);

  const tabs: RecordTab[] = [
    { key: "overview", label: "Overview" },
    { key: "companies", label: "Companies", count: person.organizations.length },
    { key: "talent", label: "Talent", count: person.creators.length },
    { key: "projects", label: "Projects", count: person.projects.length },
    { key: "formats", label: "Formats", count: person.formats.length },
    { key: "activity", label: "Activity" },
  ];
  const tab = currentTab(sp, tabs);
  const autoLink = sp.link === "1";

  return (
    <div>
      <RecordHeader
        type="person" id={person.id} slug={person.slug} path={path} version={null}
        badges={unverified && <span className="rounded bg-warn-wash px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-warn" title={person.verifiedAt ? `Last verified ${formatDate(person.verifiedAt)}` : "Never verified"}>Unverified</span>}
        name={nameField("person", record)} typeLabel="Industry person" canEdit={canEdit} favorited={chrome.favorited}
        archived={person.archived} archivedReason={person.archivedReason} mergedInto={chrome.merged} duplicates={chrome.duplicates}
        editHref={`${path}/edit`}
        subtitle={
          <div className="mt-1 text-sm text-muted">
            {[person.title, labelFor(person.roleType), person.organizations[0]?.organization.name].filter(Boolean).join(" · ")}
          </div>
        }
        verify={canEdit ? <VerifyButton type="person" id={person.id} verifiedAt={person.verifiedAt?.toISOString() ?? null} fresh={!unverified} /> : null}
        nav={<><RecordContext type="person" id={person.id} name={person.name} slug={person.slug} path={path} canEdit={canEdit} status={null} /><RecordStepper type="person" fallback={neighbors} /></>}
        linkTargets={[{ key: "companies", label: "Company" }, { key: "talent", label: "Talent" }]}
      />

      <RecordLayout details={<DetailsPanel extra={custom} type="person" id={person.id} fields={details} canEdit={canEdit} />}>
        <RecordTabs path={path} tabs={tabs} current={tab} />

        {tab === "overview" && (
          <>
            <Highlights type="person" id={person.id} fields={highlights} canEdit={canEdit} />
            <UpdatePanel user={user} targetType="person" targetId={person.id} name={person.name} path={path} recordType="industry contact" />
            {(person.email || person.phone || person.contactUrl || person.assistantEmail) && (
              <Section title="Contact">
                <div className="card space-y-1 px-4 py-3 text-sm">
                  {person.email && <div><span className="text-muted">Email · </span><a href={`mailto:${person.email}`} className="hover:text-accent-deep hover:underline">{person.email}</a></div>}
                  {person.phone && <div><span className="text-muted">Phone · </span><a href={`tel:${person.phone}`} className="hover:text-accent-deep hover:underline">{person.phone}</a></div>}
                  {person.contactUrl && <div><span className="text-muted">Link · </span><a href={person.contactUrl} target="_blank" rel="noreferrer" className="break-all hover:text-accent-deep hover:underline">{person.contactUrl}</a></div>}
                  {person.assistantEmail && <div><span className="text-muted">Assistant · </span>{person.assistantName}{person.assistantName ? " — " : ""}<a href={`mailto:${person.assistantEmail}`} className="hover:text-accent-deep hover:underline">{person.assistantEmail}</a></div>}
                </div>
              </Section>
            )}
            <Section title="Notes">
              <InlineField type="person" id={person.id} field={fieldNamed(all, "notes")} canEdit={canEdit} className="text-sm text-muted" placeholder="Add notes…" />
            </Section>
          </>
        )}

        {tab === "companies" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Company" columns={{ role: "Role" }}
            rows={person.organizations.map((po) => ({ id: po.id, name: po.organization.name, href: `/organizations/${po.organization.slug}`, role: po.role ? labelFor(po.role) : undefined, removePayload: { kind: "person_org", personId: person.id, organizationId: po.organizationId } }))}
            addConfig={{ template: { kind: "person_org", personId: person.id }, idField: "organizationId", lookupType: "organization", roleField: "role", roleOptions: PERSON_ROLE_TYPES, createKind: "organization", buttonLabel: "+ Add company" }}
            emptyMessage="No company mapped."
          />
        )}
        {tab === "talent" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Talent" columns={{ role: "Relationship" }}
            rows={person.creators.map((cp) => ({
              id: cp.id, name: cp.creator.name, href: `/talent/${cp.creator.slug}`,
              role: [labelFor(cp.relationship), cp.current ? null : "past"].filter(Boolean).join(" · "),
              removePayload: { kind: "creator_person", creatorId: cp.creatorId, personId: person.id, relationship: cp.relationship },
            }))}
            addConfig={{ template: { kind: "creator_person", personId: person.id }, idField: "creatorId", lookupType: "creator", roleField: "relationship", roleOptions: CREATOR_PERSON_RELATIONSHIPS, buttonLabel: "+ Add talent" }}
            emptyMessage="No talent represented or connected yet."
          />
        )}
        {tab === "projects" && (
          <RelationTable
            canEdit={canEdit} title="Project" columns={{ role: "Role" }}
            rows={person.projects.map((pp) => ({ id: pp.id, name: pp.project.title, href: `/projects/${pp.project.slug}`, role: labelFor(pp.role), removePayload: { kind: "project_person", projectId: pp.projectId, personId: person.id, role: pp.role } }))}
            emptyMessage="No project credits recorded. Add them from the project's People tab."
          />
        )}
        {tab === "formats" && (
          <RelationTable
            canEdit={canEdit} title="Format" columns={{ sub: "Status", role: "Role" }}
            rows={person.formats.map((fp) => ({ id: fp.id, name: fp.format.title, href: `/formats/${fp.format.slug}`, sub: labelFor(fp.format.status), role: labelFor(fp.role), removePayload: { kind: "format_person", formatId: fp.formatId, personId: person.id, role: fp.role } }))}
            emptyMessage="Not on any format in development."
          />
        )}
        {tab === "activity" && <RecordActivity type="person" id={person.id} />}
      </RecordLayout>

      <RecordFooter type="person" id={person.id} createdAt={person.createdAt} updatedAt={person.updatedAt} verifiedAt={person.verifiedAt} verifiedBy={person.verifiedBy} owner={person.owner?.name} />
    </div>
  );
}
