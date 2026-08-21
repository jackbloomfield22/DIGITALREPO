import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { recordRecentView } from "@/lib/actions/misc";
import { Portrait, Section, StatusPill } from "@/components/ui";
import { LinkChips } from "@/components/link-editor";
import { AddCandidateButton } from "@/components/opportunity-match";
import { labelFor } from "@/lib/taxonomy";
import { compactNumber, formatDate, relativeTime, totalAudience } from "@/lib/format";

const CANDIDATE_STATUSES = [
  { value: "candidate", label: "Candidate" },
  { value: "shortlist", label: "Shortlist" },
  { value: "contacted", label: "Contacted" },
  { value: "passed", label: "Passed" },
];

export default async function OpportunityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const opp = await db.opportunity.findUnique({
    where: { slug },
    include: {
      owner: { select: { name: true } },
      entityLinks: { include: { entity: true } },
      creators: {
        include: {
          creator: {
            include: { socialProfiles: { select: { followerCount: true } } },
          },
        },
      },
      formats: { include: { format: { select: { id: true, title: true, slug: true, status: true } } } },
      projects: { include: { project: { select: { id: true, title: true, slug: true } } } },
      organizations: { include: { organization: { select: { id: true, name: true, slug: true } } } },
    },
  });
  if (!opp || opp.archived) notFound();

  const canEdit = hasRole(user, "EDITOR");
  await recordRecentView(user.id, "opportunity", opp.id);

  // Deterministic matching: creators linked to any criteria entity, ranked by
  // how many criteria they hit, with explicit reasons.
  const criteriaIds = opp.entityLinks.map((l) => l.entityId);
  const consideredIds = new Set(opp.creators.map((c) => c.creatorId));
  let matches: {
    creator: { id: string; name: string; slug: string; imageUrl: string | null; headline: string | null };
    reasons: string[];
    audience: number;
  }[] = [];
  if (criteriaIds.length) {
    const links = await db.creatorEntityLink.findMany({
      where: { entityId: { in: criteriaIds }, creator: { archived: false } },
      include: {
        entity: { select: { name: true, kind: true } },
        creator: {
          select: {
            id: true, name: true, slug: true, imageUrl: true, headline: true,
            socialProfiles: { select: { followerCount: true } },
          },
        },
      },
    });
    const byCreator = new Map<string, { creator: (typeof links)[number]["creator"]; reasons: string[] }>();
    for (const link of links) {
      if (consideredIds.has(link.creatorId)) continue;
      const e = byCreator.get(link.creatorId) ?? { creator: link.creator, reasons: [] };
      e.reasons.push(
        link.entity.kind === "location"
          ? `Based in ${link.entity.name}`
          : link.entity.kind === "creator_category"
            ? `${link.entity.name}`
            : `${link.entity.name} ${link.entity.kind === "sport" ? "" : "interest"}`.trim(),
      );
      byCreator.set(link.creatorId, e);
    }
    matches = [...byCreator.values()]
      .map((m) => ({
        creator: m.creator,
        reasons: m.reasons,
        audience: totalAudience(m.creator.socialProfiles),
      }))
      .sort((a, b) => b.reasons.length - a.reasons.length || b.audience - a.audience)
      .slice(0, 6);
  }

  return (
    <div>
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="kind-badge kind-project">Opportunity</span>
          <StatusPill status={opp.status} label={labelFor(opp.status)} />
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{opp.title}</h1>
            <div className="mt-1 text-sm text-muted">
              {[labelFor(opp.type), opp.owner ? `Owner: ${opp.owner.name}` : null, opp.deadline ? `Deadline ${formatDate(opp.deadline)}` : null]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
          {canEdit && <Link href={`/opportunities/${opp.slug}/edit`} className="btn btn-primary btn-sm">Edit</Link>}
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {opp.description && (
            <Section title="Brief">
              <p className="whitespace-pre-line text-[15px] leading-relaxed">{opp.description}</p>
            </Section>
          )}

          <Section title="Criteria">
            <LinkChips
              canEdit={canEdit}
              items={opp.entityLinks.map((l) => ({
                key: l.id,
                label: l.entity.name,
                sub: labelFor(l.entity.kind),
                href: `/explore/${l.entity.kind}/${l.entity.slug}`,
                removePayload: { kind: "opportunity_entity", opportunityId: opp.id, entityId: l.entityId },
              }))}
              addConfig={{
                template: { kind: "opportunity_entity", opportunityId: opp.id },
                idField: "entityId",
                lookupType: "entity",
                createKind: "entity",
                buttonLabel: "+ Add Criterion",
              }}
              emptyMessage="No criteria set — add interests, sports, locations, or categories to enable matching."
            />
            {(opp.audienceRequirements || opp.platformRequirements) && (
              <div className="mt-3 space-y-1 text-sm text-muted">
                {opp.audienceRequirements && <div>Audience: {opp.audienceRequirements}</div>}
                {opp.platformRequirements && <div>Platform: {opp.platformRequirements}</div>}
              </div>
            )}
          </Section>

          <Section title="Creators Under Consideration">
            <div className="space-y-2">
              {opp.creators.map((oc) => (
                <div key={oc.id} className="card flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <Link href={`/creators/${oc.creator.slug}`} className="flex min-w-0 items-center gap-2.5 hover:text-accent-deep">
                    <Portrait name={oc.creator.name} imageUrl={oc.creator.imageUrl} className="h-8 w-8 shrink-0 rounded" textClass="text-[11px]" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{oc.creator.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {compactNumber(totalAudience(oc.creator.socialProfiles))} audience
                      </span>
                    </span>
                  </Link>
                  <div className="flex items-center gap-2">
                    <StatusPill status={oc.status} label={CANDIDATE_STATUSES.find((s) => s.value === oc.status)?.label ?? labelFor(oc.status)} />
                    <LinkChips
                      canEdit={canEdit}
                      items={[{
                        key: oc.id,
                        label: "remove",
                        removePayload: { kind: "opportunity_creator", opportunityId: opp.id, creatorId: oc.creatorId },
                      }]}
                    />
                  </div>
                </div>
              ))}
              <LinkChips
                canEdit={canEdit}
                items={[]}
                addConfig={{
                  template: { kind: "opportunity_creator", opportunityId: opp.id },
                  idField: "creatorId",
                  lookupType: "creator",
                  roleField: "status",
                  roleOptions: CANDIDATE_STATUSES,
                  buttonLabel: "+ Add Creator",
                }}
                emptyMessage={opp.creators.length ? "" : "No creators under consideration yet."}
              />
            </div>
          </Section>

          {matches.length > 0 && (
            <Section title="Suggested Matches">
              <div className="grid gap-2 sm:grid-cols-2">
                {matches.map((m) => (
                  <div key={m.creator.id} className="card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/creators/${m.creator.slug}`} className="flex min-w-0 items-center gap-2 hover:text-accent-deep">
                        <Portrait name={m.creator.name} imageUrl={m.creator.imageUrl} className="h-9 w-9 shrink-0 rounded" textClass="text-xs" />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{m.creator.name}</span>
                          <span className="block text-xs text-muted">{compactNumber(m.audience)} audience</span>
                        </span>
                      </Link>
                      {canEdit && (
                        <AddCandidateButton opportunityId={opp.id} creatorId={m.creator.id} creatorName={m.creator.name} />
                      )}
                    </div>
                    <div className="mt-2 text-xs text-muted">
                      <span className="font-semibold uppercase tracking-wide text-faint">Why this matches: </span>
                      {m.reasons.join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Formats Under Consideration">
            <LinkChips
              canEdit={canEdit}
              items={opp.formats.map((f) => ({
                key: f.id,
                label: f.format.title,
                sub: labelFor(f.format.status),
                href: `/formats/${f.format.slug}`,
                removePayload: { kind: "opportunity_format", opportunityId: opp.id, formatId: f.formatId },
              }))}
              addConfig={{
                template: { kind: "opportunity_format", opportunityId: opp.id },
                idField: "formatId",
                lookupType: "format",
                createKind: "format",
                buttonLabel: "+ Add Format",
              }}
              emptyMessage="No formats attached."
            />
          </Section>

          <Section title="Organizations">
            <LinkChips
              canEdit={canEdit}
              items={opp.organizations.map((o) => ({
                key: o.id,
                label: o.organization.name,
                href: `/organizations/${o.organization.slug}`,
                removePayload: { kind: "opportunity_org", opportunityId: opp.id, organizationId: o.organizationId },
              }))}
              addConfig={{
                template: { kind: "opportunity_org", opportunityId: opp.id },
                idField: "organizationId",
                lookupType: "organization",
                createKind: "organization",
                buttonLabel: "+ Add Organization",
              }}
              emptyMessage="No organizations attached."
            />
          </Section>

          {opp.projects.length > 0 && (
            <Section title="Reference Projects">
              <LinkChips
                canEdit={canEdit}
                items={opp.projects.map((p) => ({
                  key: p.id,
                  label: p.project.title,
                  href: `/projects/${p.project.slug}`,
                  removePayload: { kind: "opportunity_project", opportunityId: opp.id, projectId: p.projectId },
                }))}
                addConfig={{
                  template: { kind: "opportunity_project", opportunityId: opp.id },
                  idField: "projectId",
                  lookupType: "project",
                  buttonLabel: "+ Add Project",
                }}
              />
            </Section>
          )}

          {(opp.notes || opp.outcome || canEdit) && (
            <Section title="Notes & Outcome">
              {opp.outcome && (
                <div className="mb-2">
                  <div className="text-xs font-semibold text-muted">Outcome</div>
                  <p className="whitespace-pre-line text-sm">{opp.outcome}</p>
                </div>
              )}
              {opp.notes ? (
                <p className="whitespace-pre-line text-sm text-muted">{opp.notes}</p>
              ) : (
                !opp.outcome && <p className="text-sm text-faint">No notes yet.</p>
              )}
            </Section>
          )}
        </div>

        <aside className="min-w-0 space-y-6">
          <div className="card p-4">
            <div className="overline mb-2">Record</div>
            <ul className="space-y-1 text-xs text-muted">
              <li className="flex justify-between"><span>Status</span><span className="font-medium">{labelFor(opp.status)}</span></li>
              <li className="flex justify-between"><span>Updated</span><span>{relativeTime(opp.updatedAt)}</span></li>
              <li className="flex justify-between"><span>Created</span><span>{formatDate(opp.createdAt)}</span></li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
