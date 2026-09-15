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
import { Portrait, Section, StatusPill } from "@/components/ui";
import { AddCandidateButton } from "@/components/opportunity-match";
import { labelFor } from "@/lib/taxonomy";
import { compactNumber, totalAudience } from "@/lib/format";
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

const CANDIDATE_STATUSES = [
  { value: "candidate", label: "Candidate" },
  { value: "shortlist", label: "Shortlist" },
  { value: "contacted", label: "Contacted" },
  { value: "passed", label: "Passed" },
];
const LONG = ["description", "outcome", "notes"];

export default async function OpportunityPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: RecordSearchParams }) {
  const user = await requireUser();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const opp = await db.opportunity.findUnique({
    where: { slug },
    include: {
      owner: { select: { name: true } },
      entityLinks: { include: { entity: true } },
      creators: { include: { creator: { include: { socialProfiles: { select: { followerCount: true } } } } } },
      formats: { include: { format: { select: { id: true, title: true, slug: true, status: true } } } },
      projects: { include: { project: { select: { id: true, title: true, slug: true } } } },
      organizations: { include: { organization: { select: { id: true, name: true, slug: true } } } },
    },
  });
  if (!opp) notFound();
  if (opp.archived) {
    const to = movedTo(opp.archivedReason);
    if (to) redirect(to);
  }

  const canEdit = hasRole(user, "EDITOR");
  const path = `/opportunities/${opp.slug}`;
  await recordRecentView(user.id, "opportunity", opp.id);
  const [chrome, neighbors] = await Promise.all([
    recordChrome(user.id, "opportunity", opp.id, opp.title, opp.archived),
    recordNeighbors("opportunity", { id: opp.id, name: opp.title }),
  ]);

  // Deterministic matching: creators linked to any criteria entity, ranked by
  // how many criteria they hit, with explicit reasons.
  const criteriaIds = opp.entityLinks.map((l) => l.entityId);
  const consideredIds = new Set(opp.creators.map((c) => c.creatorId));
  let matches: { creator: { id: string; name: string; slug: string; imageUrl: string | null; headline: string | null }; reasons: string[]; audience: number }[] = [];
  if (criteriaIds.length) {
    const links = await db.creatorEntityLink.findMany({
      where: { entityId: { in: criteriaIds }, creator: { archived: false } },
      include: {
        entity: { select: { name: true, kind: true } },
        creator: { select: { id: true, name: true, slug: true, imageUrl: true, headline: true, socialProfiles: { select: { followerCount: true } } } },
      },
    });
    const byCreator = new Map<string, { creator: (typeof links)[number]["creator"]; reasons: string[] }>();
    for (const link of links) {
      if (consideredIds.has(link.creatorId)) continue;
      const e = byCreator.get(link.creatorId) ?? { creator: link.creator, reasons: [] };
      e.reasons.push(link.entity.kind === "location" ? `Based in ${link.entity.name}` : link.entity.kind === "creator_category" ? link.entity.name : `${link.entity.name} ${link.entity.kind === "sport" ? "" : "interest"}`.trim());
      byCreator.set(link.creatorId, e);
    }
    matches = [...byCreator.values()]
      .map((m) => ({ creator: m.creator, reasons: m.reasons, audience: totalAudience(m.creator.socialProfiles) }))
      .sort((a, b) => b.reasons.length - a.reasons.length || b.audience - a.audience)
      .slice(0, 6);
  }

  const record = opp as unknown as Record<string, unknown>;
  const all = detailFields("opportunity", record);
  const details = all.filter((f) => !LONG.includes(f.name));
  const highlights = pickFields(all, ["type", "deadline", "lastActivityAt", "audienceRequirements", "platformRequirements"]);

  const tabs: RecordTab[] = [
    { key: "overview", label: "Overview" },
    { key: "criteria", label: "Criteria", count: opp.entityLinks.length },
    { key: "talent", label: "Talent", count: opp.creators.length },
    { key: "formats", label: "Formats", count: opp.formats.length },
    { key: "companies", label: "Companies", count: opp.organizations.length },
    { key: "projects", label: "Projects", count: opp.projects.length },
    { key: "activity", label: "Activity" },
  ];
  const tab = currentTab(sp, tabs);
  const autoLink = sp.link === "1";

  return (
    <div>
      <RecordHeader
        type="opportunity" id={opp.id} slug={opp.slug} path={path} version={opp.version}
        name={nameField("opportunity", record)} typeLabel="Opportunity" canEdit={canEdit} favorited={chrome.favorited}
        archived={opp.archived} archivedReason={opp.archivedReason} mergedInto={chrome.merged} duplicates={chrome.duplicates}
        status={{ type: "opportunity", value: opp.status }} editHref={`${path}/edit`}
        badges={opp.type ? <span className="kind-badge kind-project">{labelFor(opp.type)}</span> : null}
        subtitle={opp.owner?.name ? <p className="mt-1 text-sm text-muted">Owned by {opp.owner.name}</p> : null}
        nav={<><RecordContext type="opportunity" id={opp.id} name={opp.title} slug={opp.slug} path={path} canEdit={canEdit} status={opp.status} /><RecordStepper type="opportunity" fallback={neighbors} /></>}
        linkTargets={[{ key: "criteria", label: "Criterion" }, { key: "talent", label: "Talent" }, { key: "formats", label: "Format" }, { key: "companies", label: "Company" }, { key: "projects", label: "Project" }]}
      />

      <RecordLayout details={<DetailsPanel type="opportunity" id={opp.id} fields={details} canEdit={canEdit} />}>
        <RecordTabs path={path} tabs={tabs} current={tab} />

        {tab === "overview" && (
          <>
            <Highlights type="opportunity" id={opp.id} fields={highlights} canEdit={canEdit} />
            <UpdatePanel user={user} targetType="opportunity" targetId={opp.id} name={opp.title} path={path} recordType="opportunity" />
            <Section title="Brief">
              <InlineField type="opportunity" id={opp.id} field={fieldNamed(all, "description")} canEdit={canEdit} className="text-[15px] leading-relaxed" placeholder="What is this opportunity? Add the brief…" />
            </Section>
            {matches.length > 0 && (
              <Section title="Suggested matches">
                <div className="grid gap-2 sm:grid-cols-2">
                  {matches.map((m) => (
                    <div key={m.creator.id} className="card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/talent/${m.creator.slug}`} className="flex min-w-0 items-center gap-2 hover:text-accent-deep">
                          <Portrait name={m.creator.name} imageUrl={m.creator.imageUrl} className="h-9 w-9 shrink-0 rounded" textClass="text-xs" />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{m.creator.name}</span>
                            <span className="block text-xs text-muted">{compactNumber(m.audience)} audience</span>
                          </span>
                        </Link>
                        {canEdit && <AddCandidateButton opportunityId={opp.id} creatorId={m.creator.id} creatorName={m.creator.name} />}
                      </div>
                      <div className="mt-2 text-xs text-muted"><span className="font-semibold uppercase tracking-wide text-faint">Why this matches: </span>{m.reasons.join(" · ")}</div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
            <Section title="Outcome">
              <InlineField type="opportunity" id={opp.id} field={fieldNamed(all, "outcome")} canEdit={canEdit} className="text-sm" placeholder="How did it end?" />
            </Section>
            <Section title="Notes">
              <InlineField type="opportunity" id={opp.id} field={fieldNamed(all, "notes")} canEdit={canEdit} className="text-sm text-muted" placeholder="Add notes…" />
            </Section>
          </>
        )}

        {tab === "criteria" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Criterion" columns={{ sub: "Kind" }}
            rows={opp.entityLinks.map((l) => ({ id: l.id, name: l.entity.name, href: `/explore/${l.entity.kind}/${l.entity.slug}`, sub: labelFor(l.entity.kind), removePayload: { kind: "opportunity_entity", opportunityId: opp.id, entityId: l.entityId } }))}
            addConfig={{ template: { kind: "opportunity_entity", opportunityId: opp.id }, idField: "entityId", lookupType: "entity", createKind: "entity", buttonLabel: "+ Add criterion" }}
            emptyMessage="No criteria set — add interests, sports, locations or categories to enable matching."
          />
        )}
        {tab === "talent" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Talent" columns={{ sub: "Audience", extra: "Stage" }}
            rows={opp.creators.map((oc) => ({
              id: oc.id, name: oc.creator.name, href: `/talent/${oc.creator.slug}`, sub: `${compactNumber(totalAudience(oc.creator.socialProfiles))}`,
              extra: <StatusPill status={oc.status} label={CANDIDATE_STATUSES.find((s) => s.value === oc.status)?.label ?? labelFor(oc.status)} />,
              removePayload: { kind: "opportunity_creator", opportunityId: opp.id, creatorId: oc.creatorId },
            }))}
            addConfig={{ template: { kind: "opportunity_creator", opportunityId: opp.id }, idField: "creatorId", lookupType: "creator", roleField: "status", roleOptions: CANDIDATE_STATUSES, buttonLabel: "+ Add talent" }}
            emptyMessage="No talent under consideration yet."
          />
        )}
        {tab === "formats" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Format" columns={{ sub: "Status" }}
            rows={opp.formats.map((f) => ({ id: f.id, name: f.format.title, href: `/formats/${f.format.slug}`, sub: labelFor(f.format.status), removePayload: { kind: "opportunity_format", opportunityId: opp.id, formatId: f.formatId } }))}
            addConfig={{ template: { kind: "opportunity_format", opportunityId: opp.id }, idField: "formatId", lookupType: "format", createKind: "format", buttonLabel: "+ Add format" }}
            emptyMessage="No formats attached."
          />
        )}
        {tab === "companies" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Company"
            rows={opp.organizations.map((o) => ({ id: o.id, name: o.organization.name, href: `/organizations/${o.organization.slug}`, removePayload: { kind: "opportunity_org", opportunityId: opp.id, organizationId: o.organizationId } }))}
            addConfig={{ template: { kind: "opportunity_org", opportunityId: opp.id }, idField: "organizationId", lookupType: "organization", createKind: "organization", buttonLabel: "+ Add company" }}
            emptyMessage="No companies attached."
          />
        )}
        {tab === "projects" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Project"
            rows={opp.projects.map((p) => ({ id: p.id, name: p.project.title, href: `/projects/${p.project.slug}`, removePayload: { kind: "opportunity_project", opportunityId: opp.id, projectId: p.projectId } }))}
            addConfig={{ template: { kind: "opportunity_project", opportunityId: opp.id }, idField: "projectId", lookupType: "project", buttonLabel: "+ Add reference project" }}
            emptyMessage="No reference projects."
          />
        )}
        {tab === "activity" && <RecordActivity type="opportunity" id={opp.id} />}
      </RecordLayout>

      <RecordFooter type="opportunity" id={opp.id} createdAt={opp.createdAt} updatedAt={opp.updatedAt} owner={opp.owner?.name} />
    </div>
  );
}
