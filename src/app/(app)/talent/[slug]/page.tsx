import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { movedTo } from "@/lib/conversions";
import { UpdatePanel } from "@/components/update-panel";
import { DeleteRecordButton } from "@/components/delete-record-button";
import { requireUser, hasRole } from "@/lib/auth";
import { recordRecentView } from "@/lib/actions/misc";
import { findRelatedCreators } from "@/lib/related";
import { Chip, EmptyState, KindBadge, Portrait, Section, StatusPill } from "@/components/ui";
import { LinkChips } from "@/components/link-editor";
import { FavoriteButton, AddToCollectionButton } from "@/components/action-buttons";
import { StickyMiniHeader, CopySummaryButton } from "@/components/profile-chrome";
import { SourceList } from "@/components/sources-attachments";
import { AttachmentList } from "@/components/attachments";
import { attachmentsFor, uploadLimit } from "@/lib/files";
import { VerifyButton } from "@/components/talent/verify-button";
import { TalentTypeSelect } from "@/components/talent/talent-type-select";
import { RepList } from "@/components/talent/rep-list";
import {
  CREATOR_ORG_RELATIONSHIPS,
  CREATOR_PERSON_RELATIONSHIPS,
  CREATOR_RELATIONSHIPS,
  HOSTING_ROLES,
  LOCATION_RELATIONSHIPS,
  PROJECT_ROLES,
  labelFor,
  socialLabel,
} from "@/lib/taxonomy";
import { ageFrom, compactNumber, formatDate, isStale, relativeTime, totalAudience } from "@/lib/format";

const BUSINESS_RELS = new Set(["founder", "owner", "investor", "advisor"]);
const BRAND_RELS = new Set(["ambassador", "campaign", "sponsored_content", "partner", "athlete", "collaboration", "team_member"]);

export default async function CreatorProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;

  const creator = await db.creator.findUnique({
    where: { slug },
    include: {
      socialProfiles: { orderBy: { followerCount: "desc" } },
      entityLinks: { include: { entity: true } },
      credits: {
        include: {
          project: {
            include: {
              organizations: { include: { organization: { select: { name: true, slug: true } } } },
            },
          },
        },
      },
      organizations: { include: { organization: true } },
      people: {
        include: {
          person: {
            include: { organizations: { include: { organization: { select: { name: true, slug: true } } } } },
          },
        },
      },
      formats: { include: { format: true } },
      relationshipsA: { include: { creatorB: { select: { id: true, name: true, slug: true } } } },
      relationshipsB: { include: { creatorA: { select: { id: true, name: true, slug: true } } } },
      opportunities: { include: { opportunity: { select: { title: true, slug: true, status: true } } } },
    },
  });
  if (!creator) notFound();
  // A page that was moved forwards to its new home; anything else archived is simply gone from here.
  if (creator.archived) {
    const to = movedTo(creator.archivedReason);
    if (to) redirect(to);
    notFound();
  }

  const canEdit = hasRole(user, "EDITOR");
  const limits = uploadLimit();
  await recordRecentView(user.id, "creator", creator.id);

  const allTalentTypes = (
    await db.entity.findMany({
      where: { kind: "creator_category" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    })
  ).map((e) => ({ id: e.id, name: e.name }));

  const [favorite, recordSources, attachments, auditEntries, related] = await Promise.all([
    db.favorite.findUnique({
      where: { userId_targetType_targetId: { userId: user.id, targetType: "creator", targetId: creator.id } },
    }),
    db.recordSource.findMany({
      where: { targetType: "creator", targetId: creator.id },
      include: { source: true },
    }),
    attachmentsFor("creator", creator.id),
    db.auditLog.findMany({
      where: { targetType: "creator", targetId: creator.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    findRelatedCreators(creator.id),
  ]);

  const byKind = (kind: string) => creator.entityLinks.filter((l) => l.entity.kind === kind);
  const categories = byKind("creator_category");
  const locations = byKind("location");
  const interests = [...byKind("interest"), ...byKind("hobby")];
  const sports = byKind("sport");
  const tags = byKind("tag");
  const basedIn = locations.find((l) => l.relationship === "based_in") ?? locations[0];
  const age = ageFrom(creator.birthday, creator.age);
  const audience = totalAudience(creator.socialProfiles);

  // Group credits by project
  const projectMap = new Map<string, { project: (typeof creator.credits)[number]["project"]; roles: { role: string }[] }>();
  for (const credit of creator.credits) {
    const entry = projectMap.get(credit.projectId) ?? { project: credit.project, roles: [] };
    entry.roles.push({ role: credit.role });
    projectMap.set(credit.projectId, entry);
  }
  const projects = [...projectMap.values()].sort(
    (a, b) => (b.project.premiereYear ?? 0) - (a.project.premiereYear ?? 0),
  );

  // Derived experience signals
  const distinctByRole = (roles: string[]) =>
    new Set(creator.credits.filter((c) => roles.includes(c.role)).map((c) => c.projectId)).size;
  const distinctByType = (types: string[]) =>
    new Set(
      creator.credits
        .filter((c) => c.project.projectType && types.includes(c.project.projectType))
        .map((c) => c.projectId),
    ).size;
  const experience = [
    { label: "Hosted", count: distinctByRole(HOSTING_ROLES) },
    { label: "Executive Produced", count: distinctByRole(["executive_producer"]) },
    { label: "Competition Series", count: distinctByType(["competition_show"]) },
    { label: "Podcasts", count: distinctByType(["podcast"]) },
    { label: "Digital Series", count: distinctByType(["youtube_series", "digital_series", "short_form_series", "social_franchise", "digital_franchise", "branded_series"]) },
    { label: "Documentary / Docuseries", count: distinctByType(["documentary", "docuseries"]) },
  ].filter((e) => e.count > 0);

  const businessOrgs = creator.organizations.filter((o) => BUSINESS_RELS.has(o.relationship));
  const brandOrgs = creator.organizations.filter((o) => BRAND_RELS.has(o.relationship));
  const otherOrgs = creator.organizations.filter(
    (o) => !BUSINESS_RELS.has(o.relationship) && !BRAND_RELS.has(o.relationship),
  );

  const collaborators = [
    ...creator.relationshipsA.map((r) => ({ other: r.creatorB, relationship: r.relationship, note: r.note, aId: r.creatorAId, bId: r.creatorBId })),
    ...creator.relationshipsB.map((r) => ({ other: r.creatorA, relationship: r.relationship, note: r.note, aId: r.creatorAId, bId: r.creatorBId })),
  ];

  // Opportunity connections (deterministic insight module)
  const topInterests = [...sports, ...interests].slice(0, 3);
  const oppConnections = await Promise.all(
    topInterests.map(async (link) => {
      const [creatorCount, formatCount] = await Promise.all([
        db.creatorEntityLink.count({ where: { entityId: link.entityId, creatorId: { not: creator.id } } }),
        db.formatEntityLink.count({ where: { entityId: link.entityId } }),
      ]);
      return { entity: link.entity, creatorCount, formatCount };
    }),
  );

  // Copy Summary text
  const summary = [
    `${creator.name.toUpperCase()} | ${categories.map((c) => c.entity.name).join(" / ") || "Talent"}`,
    [age, basedIn?.entity.name].filter(Boolean).join(" | "),
    "",
    "SOCIAL",
    ...creator.socialProfiles.map(
      (s) =>
        `${socialLabel(s.platform)}: ${s.handle ? `@${s.handle} — ` : ""}${s.followerCount != null ? compactNumber(s.followerCount) : "n/a"}${s.engagementRate != null ? ` (${s.engagementRate}% eng.)` : ""}`,
    ),
    `Total listed audience: ${compactNumber(audience)}`,
    "",
    ...(creator.people.length
      ? ["REPS", ...creator.people.map((p) => `${p.person.name} (${labelFor(p.relationship)}${p.person.organizations[0] ? `, ${p.person.organizations[0].organization.name}` : ""})`), ""]
      : []),
    ...(creator.miniBio ? ["BIO", creator.miniBio, ""] : []),
    ...(interests.length || sports.length
      ? ["INTERESTS", [...sports, ...interests].map((i) => i.entity.name).join(", "), ""]
      : []),
    ...(projects.length
      ? ["PROJECTS", ...projects.map((p) => `${p.project.title} (${p.roles.map((r) => labelFor(r.role)).join(", ")})`), ""]
      : []),
    ...(creator.formats.length
      ? ["4.4.FORTY FORMATS", ...creator.formats.map((f) => `${f.format.title} (${labelFor(f.format.status)})`)]
      : []),
  ].join("\n");

  const needsReview = isStale(creator.lastVerifiedAt, 180);

  const chipTemplate = { kind: "creator_entity" as const, creatorId: creator.id };

  return (
    <div>
      <StickyMiniHeader>
        <div className="flex min-w-0 items-center gap-2">
          <Portrait name={creator.name} imageUrl={creator.imageUrl} className="h-7 w-7 rounded" textClass="text-[10px]" />
          <span className="truncate font-display font-bold">{creator.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <FavoriteButton small targetType="creator" targetId={creator.id} favorited={!!favorite} />
          <AddToCollectionButton compact targetType="creator" targetId={creator.id} targetLabel={creator.name} />
          {canEdit && (
            <Link href={`/talent/${creator.slug}/edit`} className="btn btn-primary btn-sm">
              Edit
            </Link>
          )}
        </div>
      </StickyMiniHeader>

      {/* Header */}
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start">
        <Portrait
          name={creator.name}
          imageUrl={creator.imageUrl}
          className="h-40 w-40 shrink-0 rounded-lg sm:h-48 sm:w-48"
          textClass="text-5xl"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide sm:text-4xl">
              {creator.name}
            </h1>
            {creator.status !== "active" && (
              <StatusPill status={creator.status} label={labelFor(creator.status)} />
            )}
            {needsReview && (
              <span className="rounded bg-[#f5efdd] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warn" title={creator.lastVerifiedAt ? `Last verified ${formatDate(creator.lastVerifiedAt)}` : "Never verified"}>
                Needs Review
              </span>
            )}
          </div>
          {creator.headline && <p className="mt-1 text-muted">{creator.headline}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <TalentTypeSelect
              creatorId={creator.id}
              canEdit={canEdit}
              selected={categories.map((c) => ({ id: c.entityId, name: c.entity.name }))}
              allTypes={allTalentTypes}
            />
            {age != null && <span>{age}</span>}
            {basedIn && (
              <Link href={`/explore/location/${basedIn.entity.slug}`} className="hover:text-accent-deep hover:underline">
                {basedIn.entity.name}
              </Link>
            )}
            <span className="font-semibold text-ink">{compactNumber(audience)} listed audience</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {canEdit && (
              <Link href={`/talent/${creator.slug}/edit`} className="btn btn-primary btn-sm">
                Edit
              </Link>
            )}
            <FavoriteButton targetType="creator" targetId={creator.id} favorited={!!favorite} />
            <AddToCollectionButton targetType="creator" targetId={creator.id} targetLabel={creator.name} />
            <CopySummaryButton summary={summary} />
            <Link href={`/talent/${creator.slug}/one-sheet`} className="btn btn-secondary btn-sm">
              One-Sheet
            </Link>
            {canEdit && <DeleteRecordButton targetType="creator" id={creator.id} label={creator.name} />}
            {canEdit && <VerifyButton creatorId={creator.id} />}
          </div>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        {/* Main column */}
        <div className="min-w-0">
          <UpdatePanel
            user={user}
            targetType="creator"
            targetId={creator.id}
            name={creator.name}
            path={`/talent/${creator.slug}`}
            recordType="talent profile"
          />
          {(creator.miniBio || canEdit) && (
            <Section title="Overview">
              {creator.miniBio ? (
                <p className="whitespace-pre-line text-[15px] leading-relaxed">{creator.miniBio}</p>
              ) : (
                <EmptyState
                  message="No bio yet."
                  action={<Link className="chip border-dashed" href={`/talent/${creator.slug}/edit`}>+ Add Bio</Link>}
                />
              )}
            </Section>
          )}

          {(creator.digitalSummary || creator.socialProfiles.length > 0) && (
            <Section title="Digital">
              {creator.digitalSummary && (
                <p className="mb-3 whitespace-pre-line text-[15px] leading-relaxed">{creator.digitalSummary}</p>
              )}
              {creator.socialProfiles.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {creator.socialProfiles.map((s) => (
                    <div key={s.id} className="card flex items-center justify-between px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium">{socialLabel(s.platform)}</span>
                        {s.handle && (
                          <span className="ml-2 truncate text-muted">
                            {s.url ? (
                              <a className="hover:text-accent-deep hover:underline" href={s.url} target="_blank" rel="noreferrer">@{s.handle}</a>
                            ) : (
                              `@${s.handle}`
                            )}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">
                          {s.followerCount != null ? compactNumber(s.followerCount) : "—"}
                          {s.engagementRate != null && (
                            <span className="ml-1.5 text-[11px] font-medium text-muted">{s.engagementRate}% eng.</span>
                          )}
                        </div>
                        {s.countUpdatedAt && (
                          <div className="text-[11px] text-faint">updated {relativeTime(s.countUpdatedAt)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          <Section title="Interests & Hobbies">
            <LinkChips
              canEdit={canEdit}
              items={interests.map((l) => ({
                key: l.id,
                label: l.entity.name,
                href: `/explore/${l.entity.kind}/${l.entity.slug}`,
                removePayload: { kind: "creator_entity", creatorId: creator.id, entityId: l.entityId, relationship: l.relationship },
              }))}
              addConfig={{ template: chipTemplate, idField: "entityId", lookupType: "entity", lookupKind: "interest", createKind: "entity", buttonLabel: "+ Add Interest" }}
              emptyMessage="No interests mapped yet."
            />
          </Section>

          <Section title="Sports">
            <LinkChips
              canEdit={canEdit}
              items={sports.map((l) => ({
                key: l.id,
                label: l.entity.name,
                href: `/explore/sport/${l.entity.slug}`,
                removePayload: { kind: "creator_entity", creatorId: creator.id, entityId: l.entityId, relationship: l.relationship },
              }))}
              addConfig={{ template: chipTemplate, idField: "entityId", lookupType: "entity", lookupKind: "sport", createKind: "entity", buttonLabel: "+ Add Sport" }}
              emptyMessage="No sports mapped yet."
            />
          </Section>

          <Section title="Existing Projects">
            <div className="space-y-3">
              {projects.map(({ project, roles }) => {
                const prodCo = project.organizations.find((o) => o.relationship === "production_company");
                const platform = project.organizations.find((o) => ["network", "streamer", "platform", "distributor"].includes(o.relationship));
                return (
                  <div key={project.id} className="card px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link href={`/projects/${project.slug}`} className="truncate font-semibold hover:text-accent-deep hover:underline">
                          {project.title}
                        </Link>
                        <KindBadge kind="project" />
                      </div>
                      <span className="text-xs text-muted">
                        {[labelFor(project.projectType), project.premiereYear].filter(Boolean).join (" · ")}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                      <LinkChips
                        canEdit={canEdit}
                        items={roles.map((r) => ({
                          key: r.role,
                          label: labelFor(r.role),
                          removePayload: { kind: "creator_project", creatorId: creator.id, projectId: project.id, role: r.role },
                        }))}
                      />
                      {prodCo && (
                        <span className="text-muted">
                          Prod: <Link className="hover:text-accent-deep hover:underline" href={`/organizations/${prodCo.organization.slug}`}>{prodCo.organization.name}</Link>
                        </span>
                      )}
                      {platform && (
                        <span className="text-muted">
                          On: <Link className="hover:text-accent-deep hover:underline" href={`/organizations/${platform.organization.slug}`}>{platform.organization.name}</Link>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              <LinkChips
                canEdit={canEdit}
                items={[]}
                addConfig={{
                  template: { kind: "creator_project", creatorId: creator.id },
                  idField: "projectId",
                  lookupType: "project",
                  roleField: "role",
                  roleOptions: PROJECT_ROLES,
                  createKind: "project",
                  buttonLabel: "+ Add Existing Project",
                  placeholder: "Search or create project…",
                }}
                emptyMessage={projects.length ? "" : "No projects added yet."}
              />
            </div>
          </Section>

          <Section title="4.4.Forty Formats">
            <div className="space-y-2">
              {creator.formats.map((cf) => (
                <div key={cf.id} className="card flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link href={`/formats/${cf.format.slug}`} className="truncate font-semibold hover:text-accent-deep hover:underline">
                      {cf.format.title}
                    </Link>
                    <KindBadge kind="format" />
                    {cf.isPrimary && <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-deep">Primary</span>}
                  </div>
                  <StatusPill status={cf.format.status} label={labelFor(cf.format.status)} />
                </div>
              ))}
              <LinkChips
                canEdit={canEdit}
                items={[]}
                addConfig={{
                  template: { kind: "creator_format", creatorId: creator.id },
                  idField: "formatId",
                  lookupType: "format",
                  createKind: "format",
                  buttonLabel: "+ Attach Format",
                }}
                emptyMessage={creator.formats.length ? "" : "No 4.4.Forty formats attached yet."}
              />
            </div>
          </Section>

          <Section title="Business & Investments">
            <LinkChips
              canEdit={canEdit}
              items={businessOrgs.map((o) => ({
                key: o.id,
                label: o.organization.name,
                sub: labelFor(o.relationship),
                href: `/organizations/${o.organization.slug}`,
                removePayload: { kind: "creator_org", creatorId: creator.id, organizationId: o.organizationId, relationship: o.relationship },
              }))}
              addConfig={{
                template: { kind: "creator_org", creatorId: creator.id },
                idField: "organizationId",
                lookupType: "organization",
                roleField: "relationship",
                roleOptions: CREATOR_ORG_RELATIONSHIPS.filter((r) => BUSINESS_RELS.has(r.value)),
                createKind: "organization",
                buttonLabel: "+ Add Business",
              }}
              emptyMessage="No businesses or investments recorded."
            />
          </Section>

          <Section title="Brand Relationships">
            <LinkChips
              canEdit={canEdit}
              items={brandOrgs.map((o) => ({
                key: o.id,
                label: o.organization.name,
                sub: [labelFor(o.relationship), o.status === "past" ? "past" : null].filter(Boolean).join(" · "),
                href: `/organizations/${o.organization.slug}`,
                removePayload: { kind: "creator_org", creatorId: creator.id, organizationId: o.organizationId, relationship: o.relationship },
              }))}
              addConfig={{
                template: { kind: "creator_org", creatorId: creator.id },
                idField: "organizationId",
                lookupType: "organization",
                roleField: "relationship",
                roleOptions: CREATOR_ORG_RELATIONSHIPS.filter((r) => BRAND_RELS.has(r.value)),
                createKind: "organization",
                buttonLabel: "+ Add Brand",
              }}
              emptyMessage="No brand relationships recorded."
            />
          </Section>

          <Section title="Collaborators">
            <LinkChips
              canEdit={canEdit}
              items={collaborators.map((c) => ({
                key: `${c.other.id}-${c.relationship}`,
                label: c.other.name,
                sub: labelFor(c.relationship),
                href: `/talent/${c.other.slug}`,
                removePayload: { kind: "creator_creator", creatorAId: c.aId, creatorBId: c.bId, relationship: c.relationship },
              }))}
              addConfig={{
                template: { kind: "creator_creator", creatorAId: creator.id },
                idField: "creatorBId",
                lookupType: "creator",
                roleField: "relationship",
                roleOptions: CREATOR_RELATIONSHIPS,
                buttonLabel: "+ Add Collaborator",
              }}
              emptyMessage="No creator relationships recorded."
            />
          </Section>

          <Section title="Representation">
            <RepList
              creatorId={creator.id}
              canEdit={canEdit}
              reps={creator.people.map((p) => ({
                id: p.id,
                personId: p.personId,
                relationship: p.relationship,
                current: p.current,
                start: p.start,
                end: p.end,
                person: {
                  name: p.person.name,
                  slug: p.person.slug,
                  email: p.person.email,
                  phone: p.person.phone,
                  assistantName: p.person.assistantName,
                  assistantEmail: p.person.assistantEmail,
                  orgName: p.person.organizations[0]?.organization.name ?? null,
                },
              }))}
            />
            {(canEdit || creator.people.length === 0) && (
              <LinkChips
                canEdit={canEdit}
                items={[]}
                addConfig={{
                  template: { kind: "creator_person", creatorId: creator.id },
                  idField: "personId",
                  lookupType: "person",
                  roleField: "relationship",
                  roleOptions: CREATOR_PERSON_RELATIONSHIPS,
                  createKind: "person",
                  buttonLabel: "+ Add Rep",
                }}
                emptyMessage="No representation recorded."
              />
            )}
          </Section>

          {(otherOrgs.length > 0 || canEdit) && (
            <Section title="Organizations">
              <LinkChips
                canEdit={canEdit}
                items={otherOrgs.map((o) => ({
                  key: o.id,
                  label: o.organization.name,
                  sub: labelFor(o.relationship),
                  href: `/organizations/${o.organization.slug}`,
                  removePayload: { kind: "creator_org", creatorId: creator.id, organizationId: o.organizationId, relationship: o.relationship },
                }))}
                addConfig={{
                  template: { kind: "creator_org", creatorId: creator.id },
                  idField: "organizationId",
                  lookupType: "organization",
                  roleField: "relationship",
                  roleOptions: CREATOR_ORG_RELATIONSHIPS,
                  createKind: "organization",
                  buttonLabel: "+ Add Organization",
                }}
                emptyMessage="No other organizations linked."
              />
            </Section>
          )}

          {(creator.opportunityNotes || canEdit) && (
            <Section title="Opportunity Notes">
              {creator.opportunityNotes ? (
                <p className="whitespace-pre-line text-[15px] leading-relaxed">{creator.opportunityNotes}</p>
              ) : (
                <EmptyState message="Why is this person interesting creatively or commercially?" action={<Link className="chip border-dashed" href={`/talent/${creator.slug}/edit`}>+ Add Notes</Link>} />
              )}
            </Section>
          )}

          <Section title="Sources">
            <SourceList
              canEdit={canEdit}
              targetType="creator"
              targetId={creator.id}
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
              targetType="creator"
              targetId={creator.id}
              attachments={attachments}
              blobReady={limits.blob}
              maxBytes={limits.bytes}
            />
          </Section>

          {(creator.internalNotes || canEdit) && (
            <Section title="Internal Notes">
              {creator.internalNotes ? (
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{creator.internalNotes}</p>
              ) : (
                <p className="text-sm text-faint">No internal notes.</p>
              )}
            </Section>
          )}
        </div>

        {/* Right rail */}
        <aside className="min-w-0 space-y-6">
          {experience.length > 0 && (
            <div className="card p-4">
              <div className="overline mb-2">Experience</div>
              <ul className="space-y-1 text-sm">
                {experience.map((e) => (
                  <li key={e.label} className="flex justify-between">
                    <span className="text-muted">{e.label}</span>
                    <span className="font-semibold">{e.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {creator.opportunities.length > 0 && (
            <div className="card p-4">
              <div className="overline mb-2">Opportunities</div>
              <ul className="space-y-1.5 text-sm">
                {creator.opportunities.map((o) => (
                  <li key={o.id} className="flex items-baseline justify-between gap-2">
                    <Link href={`/opportunities/${o.opportunity.slug}`} className="truncate hover:text-accent-deep hover:underline">
                      {o.opportunity.title}
                    </Link>
                    <span className="shrink-0 text-xs text-muted">{labelFor(o.status)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {oppConnections.length > 0 && (
            <div className="card p-4">
              <div className="overline mb-2">Opportunity Connections</div>
              <ul className="space-y-2 text-sm">
                {oppConnections.map((c) => (
                  <li key={c.entity.id}>
                    <Link href={`/explore/${c.entity.kind}/${c.entity.slug}`} className="font-medium hover:text-accent-deep hover:underline">
                      {c.entity.name}
                    </Link>
                    <div className="text-xs text-muted">
                      {c.creatorCount} other {c.creatorCount === 1 ? "creator" : "creators"} · {c.formatCount} {c.formatCount === 1 ? "format" : "formats"}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {related.length > 0 && (
            <div className="card p-4">
              <div className="overline mb-2">Related Talent</div>
              <ul className="space-y-3">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/talent/${r.slug}`} className="flex items-center gap-2 font-medium hover:text-accent-deep">
                      <Portrait name={r.name} imageUrl={r.imageUrl} className="h-7 w-7 shrink-0 rounded" textClass="text-[10px]" />
                      <span className="truncate">{r.name}</span>
                    </Link>
                    <div className="ml-9 text-xs text-muted">{r.reasons.join(" · ")}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tags.length > 0 && (
            <div className="card p-4">
              <div className="overline mb-2">Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Chip key={t.id} href={`/explore/tag/${t.entity.slug}`}>{t.entity.name}</Chip>
                ))}
              </div>
            </div>
          )}

          <div className="card p-4">
            <div className="overline mb-2">Locations</div>
            <LinkChips
              canEdit={canEdit}
              items={locations.map((l) => ({
                key: l.id,
                label: l.entity.name,
                sub: l.relationship ? labelFor(l.relationship) : undefined,
                href: `/explore/location/${l.entity.slug}`,
                removePayload: { kind: "creator_entity", creatorId: creator.id, entityId: l.entityId, relationship: l.relationship },
              }))}
              addConfig={{
                template: chipTemplate,
                idField: "entityId",
                lookupType: "entity",
                lookupKind: "location",
                roleField: "relationship",
                roleOptions: LOCATION_RELATIONSHIPS,
                roleDefault: "based_in",
                createKind: "entity",
                buttonLabel: "+ Location",
              }}
              emptyMessage="No locations."
            />
          </div>

          <div className="card p-4">
            <div className="overline mb-2">Record</div>
            <ul className="space-y-1 text-xs text-muted">
              <li className="flex justify-between"><span>Updated</span><span>{relativeTime(creator.updatedAt)}</span></li>
              <li className="flex justify-between"><span>Last verified</span><span>{creator.lastVerifiedAt ? relativeTime(creator.lastVerifiedAt) : "never"}</span></li>
              <li className="flex justify-between"><span>Added</span><span>{formatDate(creator.createdAt)}</span></li>
            </ul>
            {auditEntries.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-ink">History</summary>
                <ul className="mt-2 space-y-1.5 text-xs text-muted">
                  {auditEntries.map((a) => (
                    <li key={a.id}>
                      <span className="text-faint">{formatDate(a.createdAt)}</span>{" "}
                      {a.userName ?? "Someone"} {a.action}
                      {a.field ? ` ${a.field}` : ""}
                      {a.oldValue || a.newValue ? (
                        <span className="text-faint">
                          {" "}
                          {a.oldValue ? `${a.oldValue.slice(0, 40)} → ` : ""}
                          {a.newValue?.slice(0, 40) ?? ""}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <Link href={`/activity?type=creator&id=${creator.id}`} className="mt-2 inline-block text-xs underline underline-offset-2 hover:text-accent">
                  Full history →
                </Link>
              </details>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
