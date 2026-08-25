import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DeleteRecordButton } from "@/components/delete-record-button";
import { requireUser, hasRole } from "@/lib/auth";
import { recordRecentView } from "@/lib/actions/misc";
import { findRelatedProjects } from "@/lib/related";
import { EmptyState, KindBadge, Portrait, Section, StatusPill } from "@/components/ui";
import { LinkChips } from "@/components/link-editor";
import { FavoriteButton, AddToCollectionButton } from "@/components/action-buttons";
import { SourceList, AttachmentList } from "@/components/sources-attachments";
import {
  PERSON_PROJECT_ROLES,
  PROJECT_ORG_RELATIONSHIPS,
  PROJECT_ROLES,
  labelFor,
} from "@/lib/taxonomy";
import { formatDate, relativeTime } from "@/lib/format";

const PRODUCTION_RELS = new Set(["production_company", "co_production_company", "studio", "financier", "rights_holder", "agency", "publisher"]);
const DISTRIBUTION_RELS = new Set(["network", "streamer", "distributor", "platform"]);
const BRAND_RELS = new Set(["brand_partner", "sponsor"]);

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const project = await db.project.findUnique({
    where: { slug },
    include: {
      credits: { include: { creator: { select: { id: true, name: true, slug: true, imageUrl: true } } } },
      organizations: { include: { organization: true } },
      entityLinks: { include: { entity: true } },
      people: { include: { person: { select: { id: true, name: true, slug: true, title: true } } } },
      opportunities: { include: { opportunity: { select: { title: true, slug: true } } } },
    },
  });
  if (!project || project.archived) notFound();

  const canEdit = hasRole(user, "EDITOR");
  await recordRecentView(user.id, "project", project.id);

  const [favorite, recordSources, attachments, related] = await Promise.all([
    db.favorite.findUnique({
      where: { userId_targetType_targetId: { userId: user.id, targetType: "project", targetId: project.id } },
    }),
    db.recordSource.findMany({ where: { targetType: "project", targetId: project.id }, include: { source: true } }),
    db.attachment.findMany({ where: { targetType: "project", targetId: project.id } }),
    findRelatedProjects(project.id),
  ]);

  // Group credits by creator
  const talentMap = new Map<string, { creator: (typeof project.credits)[number]["creator"]; roles: string[] }>();
  for (const c of project.credits) {
    const e = talentMap.get(c.creatorId) ?? { creator: c.creator, roles: [] };
    e.roles.push(c.role);
    talentMap.set(c.creatorId, e);
  }

  const orgGroup = (rels: Set<string>) => project.organizations.filter((o) => rels.has(o.relationship));
  const otherOrgs = project.organizations.filter(
    (o) => !PRODUCTION_RELS.has(o.relationship) && !DISTRIBUTION_RELS.has(o.relationship) && !BRAND_RELS.has(o.relationship),
  );

  const links = [
    { label: "Trailer", url: project.trailerUrl },
    { label: "Official Page", url: project.officialUrl },
    { label: "IMDb", url: project.imdbUrl },
    { label: "YouTube", url: project.youtubeUrl },
  ].filter((l) => l.url);

  const facts = [
    ["Type", labelFor(project.projectType)],
    ["Status", labelFor(project.status)],
    ["Premiered", project.premiereYear?.toString()],
    ["Ended", project.endYear?.toString()],
    ["Seasons", project.seasons?.toString()],
    ["Episodes", project.episodes?.toString()],
    ["Runtime", project.runtimeMinutes ? `${project.runtimeMinutes} min` : null],
    ["Country", project.country],
  ].filter(([, v]) => v) as [string, string][];

  const orgSection = (title: string, rels: Set<string>, roleOptions: typeof PROJECT_ORG_RELATIONSHIPS, empty: string) => (
    <Section title={title}>
      <LinkChips
        canEdit={canEdit}
        items={orgGroup(rels).map((o) => ({
          key: o.id,
          label: o.organization.name,
          sub: labelFor(o.relationship),
          href: `/organizations/${o.organization.slug}`,
          removePayload: { kind: "project_org", projectId: project.id, organizationId: o.organizationId, relationship: o.relationship },
        }))}
        addConfig={{
          template: { kind: "project_org", projectId: project.id },
          idField: "organizationId",
          lookupType: "organization",
          roleField: "relationship",
          roleOptions,
          createKind: "organization",
          buttonLabel: "+ Add Company",
        }}
        emptyMessage={empty}
      />
    </Section>
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2.5">
          <KindBadge kind="project" />
          <StatusPill status={project.status} label={labelFor(project.status)} />
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{project.title}</h1>
            <div className="mt-1 text-sm text-muted">
              {[labelFor(project.projectType), project.premiereYear, project.seasons ? `${project.seasons} seasons` : null, project.episodes ? `${project.episodes} episodes` : null]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {project.logline && <p className="mt-2 max-w-2xl text-[15px] italic text-charcoal">{project.logline}</p>}
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <Link href={`/projects/${project.slug}/edit`} className="btn btn-primary btn-sm">Edit</Link>
            )}
            {canEdit && <DeleteRecordButton targetType="project" id={project.id} label={project.title} />}
            <FavoriteButton targetType="project" targetId={project.id} favorited={!!favorite} />
            <AddToCollectionButton targetType="project" targetId={project.id} targetLabel={project.title} />
          </div>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {(project.description || canEdit) && (
            <Section title="Description">
              {project.description ? (
                <p className="whitespace-pre-line text-[15px] leading-relaxed">{project.description}</p>
              ) : (
                <EmptyState message="No description yet." action={<Link className="chip border-dashed" href={`/projects/${project.slug}/edit`}>+ Add Description</Link>} />
              )}
            </Section>
          )}

          <Section title="Talent">
            <div className="space-y-2">
              {[...talentMap.values()].map(({ creator, roles }) => (
                <div key={creator.id} className="card flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <Link href={`/talent/${creator.slug}`} className="flex min-w-0 items-center gap-2.5 font-semibold hover:text-accent-deep">
                    <Portrait name={creator.name} imageUrl={creator.imageUrl} className="h-8 w-8 shrink-0 rounded" textClass="text-[11px]" />
                    <span className="truncate">{creator.name}</span>
                  </Link>
                  <LinkChips
                    canEdit={canEdit}
                    items={roles.map((role) => ({
                      key: role,
                      label: labelFor(role),
                      removePayload: { kind: "creator_project", creatorId: creator.id, projectId: project.id, role },
                    }))}
                  />
                </div>
              ))}
              <LinkChips
                canEdit={canEdit}
                items={[]}
                addConfig={{
                  template: { kind: "creator_project", projectId: project.id },
                  idField: "creatorId",
                  lookupType: "creator",
                  roleField: "role",
                  roleOptions: PROJECT_ROLES,
                  buttonLabel: "+ Add Talent",
                }}
                emptyMessage={talentMap.size ? "" : "No talent linked yet."}
              />
            </div>
          </Section>

          <Section title="Key Industry People">
            <LinkChips
              canEdit={canEdit}
              items={project.people.map((pp) => ({
                key: pp.id,
                label: pp.person.name,
                sub: labelFor(pp.role),
                href: `/people/${pp.person.slug}`,
                removePayload: { kind: "project_person", projectId: project.id, personId: pp.personId, role: pp.role },
              }))}
              addConfig={{
                template: { kind: "project_person", projectId: project.id },
                idField: "personId",
                lookupType: "person",
                roleField: "role",
                roleOptions: PERSON_PROJECT_ROLES,
                createKind: "person",
                buttonLabel: "+ Add Credit",
              }}
              emptyMessage="No industry credits recorded."
            />
          </Section>

          {orgSection("Production", PRODUCTION_RELS, PROJECT_ORG_RELATIONSHIPS.filter((r) => PRODUCTION_RELS.has(r.value)), "No production companies linked.")}
          {orgSection("Platforms & Distribution", DISTRIBUTION_RELS, PROJECT_ORG_RELATIONSHIPS.filter((r) => DISTRIBUTION_RELS.has(r.value)), "No networks or platforms linked.")}
          {orgSection("Brands & Sponsors", BRAND_RELS, PROJECT_ORG_RELATIONSHIPS.filter((r) => BRAND_RELS.has(r.value)), "No brand partners recorded.")}
          {otherOrgs.length > 0 &&
            orgSection("Other Organizations", new Set(otherOrgs.map((o) => o.relationship)), PROJECT_ORG_RELATIONSHIPS, "")}

          <Section title="Topics & Genres">
            <LinkChips
              canEdit={canEdit}
              items={project.entityLinks.map((l) => ({
                key: l.id,
                label: l.entity.name,
                sub: labelFor(l.entity.kind),
                href: `/explore/${l.entity.kind}/${l.entity.slug}`,
                removePayload: { kind: "project_entity", projectId: project.id, entityId: l.entityId },
              }))}
              addConfig={{
                template: { kind: "project_entity", projectId: project.id },
                idField: "entityId",
                lookupType: "entity",
                createKind: "entity",
                lookupKind: "vertical",
                buttonLabel: "+ Add Topic",
              }}
              emptyMessage="No topics tagged."
            />
          </Section>

          {links.length > 0 && (
            <Section title="Links">
              <div className="flex flex-wrap gap-2">
                {links.map((l) => (
                  <a key={l.label} className="chip" href={l.url!} target="_blank" rel="noreferrer">
                    {l.label} ↗
                  </a>
                ))}
              </div>
            </Section>
          )}

          <Section title="Sources">
            <SourceList
              canEdit={canEdit}
              targetType="project"
              targetId={project.id}
              sources={recordSources.map((rs) => ({
                recordSourceId: rs.id,
                title: rs.source.title,
                url: rs.source.url,
                sourceType: rs.source.sourceType,
              }))}
            />
          </Section>

          <Section title="Attachments">
            <AttachmentList
              canEdit={canEdit}
              targetType="project"
              targetId={project.id}
              attachments={attachments.map((a) => ({
                id: a.id, filename: a.filename, url: `/api/files/${a.storedPath}`, sizeBytes: a.sizeBytes,
              }))}
            />
          </Section>

          {(project.internalNotes || canEdit) && (
            <Section title="Internal Notes">
              {project.internalNotes ? (
                <p className="whitespace-pre-line text-sm text-muted">{project.internalNotes}</p>
              ) : (
                <p className="text-sm text-faint">No internal notes.</p>
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

          {project.opportunities.length > 0 && (
            <div className="card p-4">
              <div className="overline mb-2">Opportunities</div>
              <ul className="space-y-1 text-sm">
                {project.opportunities.map((o) => (
                  <li key={o.id}>
                    <Link href={`/opportunities/${o.opportunity.slug}`} className="hover:text-accent-deep hover:underline">
                      {o.opportunity.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {related.length > 0 && (
            <div className="card p-4">
              <div className="overline mb-2">Related Projects</div>
              <ul className="space-y-2.5 text-sm">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/projects/${r.slug}`} className="font-medium hover:text-accent-deep hover:underline">
                      {r.title}
                    </Link>
                    <div className="text-xs text-muted">{r.reasons.join(" · ")}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card p-4">
            <div className="overline mb-2">Record</div>
            <ul className="space-y-1 text-xs text-muted">
              <li className="flex justify-between"><span>Updated</span><span>{relativeTime(project.updatedAt)}</span></li>
              <li className="flex justify-between"><span>Added</span><span>{formatDate(project.createdAt)}</span></li>
            </ul>
            <Link href={`/activity?type=project&id=${project.id}`} className="mt-2 inline-block text-xs underline underline-offset-2 hover:text-accent">
              History →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
