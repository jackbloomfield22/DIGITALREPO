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
import { findRelatedCreators } from "@/lib/related";
import { Chip, KindBadge, Portrait, Section, StatusPill } from "@/components/ui";
import { LinkChips } from "@/components/link-editor";
import { AddToCollectionButton } from "@/components/action-buttons";
import { CopySummaryButton } from "@/components/profile-chrome";
import { SourceList } from "@/components/sources-attachments";
import { AttachmentList } from "@/components/attachments";
import { attachmentsFor, uploadLimit } from "@/lib/files";
import { VerifyButton } from "@/components/talent/verify-button";
import { TalentTypeSelect } from "@/components/talent/talent-type-select";
import { RepList } from "@/components/talent/rep-list";
import {
  CREATOR_ORG_RELATIONSHIPS, CREATOR_PERSON_RELATIONSHIPS, CREATOR_RELATIONSHIPS, HOSTING_ROLES, LOCATION_RELATIONSHIPS, PROJECT_ROLES, labelFor, socialLabel,
} from "@/lib/taxonomy";
import { ageFrom, compactNumber, formatDate, isStale, relativeTime, totalAudience } from "@/lib/format";
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

const BUSINESS_RELS = new Set(["founder", "owner", "investor", "advisor"]);
const BRAND_RELS = new Set(["ambassador", "campaign", "sponsored_content", "partner", "athlete", "collaboration", "team_member"]);
const LONG = ["miniBio", "digitalSummary", "opportunityNotes", "internalNotes"];

export default async function CreatorProfilePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: RecordSearchParams }) {
  const user = await requireUser();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);

  const creator = await db.creator.findUnique({
    where: { slug },
    include: {
      socialProfiles: { orderBy: { followerCount: "desc" } },
      entityLinks: { include: { entity: true } },
      credits: { include: { project: { include: { organizations: { include: { organization: { select: { name: true, slug: true } } } } } } } },
      organizations: { include: { organization: true } },
      people: { include: { person: { include: { organizations: { include: { organization: { select: { name: true, slug: true } } } } } } } },
      formats: { include: { format: true } },
      relationshipsA: { include: { creatorB: { select: { id: true, name: true, slug: true } } } },
      relationshipsB: { include: { creatorA: { select: { id: true, name: true, slug: true } } } },
      opportunities: { include: { opportunity: { select: { id: true, title: true, slug: true, status: true } } } },
    },
  });
  if (!creator) notFound();
  if (creator.archived) {
    const to = movedTo(creator.archivedReason);
    if (to) redirect(to);
  }

  const canEdit = hasRole(user, "EDITOR");
  const limits = uploadLimit();
  const path = `/talent/${creator.slug}`;
  await recordRecentView(user.id, "creator", creator.id);

  const [chrome, recordSources, attachments, related, allTalentTypes, neighbors] = await Promise.all([
    recordChrome(user.id, "creator", creator.id, creator.name, creator.archived),
    db.recordSource.findMany({ where: { targetType: "creator", targetId: creator.id }, include: { source: true } }),
    attachmentsFor("creator", creator.id),
    findRelatedCreators(creator.id),
    db.entity.findMany({ where: { kind: "creator_category" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    recordNeighbors("creator", { id: creator.id, name: creator.name }),
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
  const needsReview = isStale(creator.lastVerifiedAt, 180);
  const chipTemplate = { kind: "creator_entity" as const, creatorId: creator.id };

  const projectMap = new Map<string, { project: (typeof creator.credits)[number]["project"]; roles: string[] }>();
  for (const credit of creator.credits) {
    const entry = projectMap.get(credit.projectId) ?? { project: credit.project, roles: [] };
    entry.roles.push(credit.role);
    projectMap.set(credit.projectId, entry);
  }
  const projects = [...projectMap.values()].sort((a, b) => (b.project.premiereYear ?? 0) - (a.project.premiereYear ?? 0));

  const distinctByRole = (roles: string[]) => new Set(creator.credits.filter((c) => roles.includes(c.role)).map((c) => c.projectId)).size;
  const distinctByType = (types: string[]) => new Set(creator.credits.filter((c) => c.project.projectType && types.includes(c.project.projectType)).map((c) => c.projectId)).size;
  const experience = [
    { label: "Hosted", count: distinctByRole(HOSTING_ROLES) },
    { label: "Executive produced", count: distinctByRole(["executive_producer"]) },
    { label: "Competition series", count: distinctByType(["competition_show"]) },
    { label: "Podcasts", count: distinctByType(["podcast"]) },
    { label: "Digital series", count: distinctByType(["youtube_series", "digital_series", "short_form_series", "social_franchise", "digital_franchise", "branded_series"]) },
    { label: "Documentary / docuseries", count: distinctByType(["documentary", "docuseries"]) },
  ].filter((e) => e.count > 0);

  const orgGroup = (o: (typeof creator.organizations)[number]) => (BUSINESS_RELS.has(o.relationship) ? "Business & investments" : BRAND_RELS.has(o.relationship) ? "Brand relationships" : "Other");
  const collaborators = [
    ...creator.relationshipsA.map((r) => ({ other: r.creatorB, relationship: r.relationship, note: r.note, aId: r.creatorAId, bId: r.creatorBId })),
    ...creator.relationshipsB.map((r) => ({ other: r.creatorA, relationship: r.relationship, note: r.note, aId: r.creatorAId, bId: r.creatorBId })),
  ];

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

  const summary = [
    `${creator.name.toUpperCase()} | ${categories.map((c) => c.entity.name).join(" / ") || "Talent"}`,
    [age, basedIn?.entity.name].filter(Boolean).join(" | "),
    "",
    "SOCIAL",
    ...creator.socialProfiles.map((s) => `${socialLabel(s.platform)}: ${s.handle ? `@${s.handle} — ` : ""}${s.followerCount != null ? compactNumber(s.followerCount) : "n/a"}${s.engagementRate != null ? ` (${s.engagementRate}% eng.)` : ""}`),
    `Total listed audience: ${compactNumber(audience)}`,
    "",
    ...(creator.people.length ? ["REPS", ...creator.people.map((p) => `${p.person.name} (${labelFor(p.relationship)}${p.person.organizations[0] ? `, ${p.person.organizations[0].organization.name}` : ""})`), ""] : []),
    ...(creator.miniBio ? ["BIO", creator.miniBio, ""] : []),
    ...(interests.length || sports.length ? ["INTERESTS", [...sports, ...interests].map((i) => i.entity.name).join(", "), ""] : []),
    ...(projects.length ? ["PROJECTS", ...projects.map((p) => `${p.project.title} (${p.roles.map((r) => labelFor(r)).join(", ")})`), ""] : []),
    ...(creator.formats.length ? ["4.4.FORTY FORMATS", ...creator.formats.map((f) => `${f.format.title} (${labelFor(f.format.status)})`)] : []),
  ].join("\n");

  const record = creator as unknown as Record<string, unknown>;
  const all = detailFields("creator", record);
  const details = all.filter((f) => !LONG.includes(f.name) && f.name !== "headline");
  const highlights = pickFields(all, ["status", "age", "birthday", "aliases"]);

  const tabs: RecordTab[] = [
    { key: "overview", label: "Overview" },
    { key: "projects", label: "Projects", count: projects.length },
    { key: "formats", label: "Formats", count: creator.formats.length },
    { key: "companies", label: "Companies", count: creator.organizations.length },
    { key: "reps", label: "Reps", count: creator.people.length },
    { key: "collaborators", label: "Collaborators", count: collaborators.length },
    { key: "opportunities", label: "Opportunities", count: creator.opportunities.length },
    { key: "activity", label: "Activity" },
  ];
  const tab = currentTab(sp, tabs);
  const autoLink = sp.link === "1";

  return (
    <div>
      <RecordHeader
        type="creator" id={creator.id} slug={creator.slug} path={path} version={creator.version}
        name={nameField("creator", record)} typeLabel="Talent" canEdit={canEdit} favorited={chrome.favorited}
        archived={creator.archived} archivedReason={creator.archivedReason} mergedInto={chrome.merged} duplicates={chrome.duplicates}
        status={{ type: "creator", value: creator.status }} editHref={`${path}/edit`}
        media={<Portrait name={creator.name} imageUrl={creator.imageUrl} className="h-32 w-32 shrink-0 rounded-lg sm:h-40 sm:w-40" textClass="text-5xl" />}
        badges={needsReview ? <span className="rounded bg-warn-wash px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-warn" title={creator.lastVerifiedAt ? `Last verified ${formatDate(creator.lastVerifiedAt)}` : "Never verified"}>Needs review</span> : null}
        subtitle={
          <>
            <p className="mt-1 text-muted"><InlineField type="creator" id={creator.id} field={fieldNamed(all, "headline")} canEdit={canEdit} placeholder="Add a headline…" /></p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <TalentTypeSelect creatorId={creator.id} canEdit={canEdit} selected={categories.map((c) => ({ id: c.entityId, name: c.entity.name }))} allTypes={allTalentTypes} />
              {age != null && <span>{age}</span>}
              {basedIn && <Link href={`/explore/location/${basedIn.entity.slug}`} className="hover:text-accent-deep hover:underline">{basedIn.entity.name}</Link>}
              <span className="font-semibold text-ink">{compactNumber(audience)} listed audience</span>
            </div>
          </>
        }
        nav={<><RecordContext type="creator" id={creator.id} name={creator.name} slug={creator.slug} path={path} canEdit={canEdit} status={creator.status} /><RecordStepper type="creator" fallback={neighbors} /></>}
        verify={canEdit ? <VerifyButton creatorId={creator.id} /> : null}
        actions={<><AddToCollectionButton targetType="creator" targetId={creator.id} targetLabel={creator.name} /><CopySummaryButton summary={summary} /><Link href={`${path}/one-sheet`} className="btn btn-secondary btn-sm">One-sheet</Link></>}
        linkTargets={[{ key: "projects", label: "Project" }, { key: "formats", label: "Format" }, { key: "companies", label: "Company" }, { key: "reps", label: "Rep" }, { key: "collaborators", label: "Collaborator" }]}
      />

      <RecordLayout details={<>
        <DetailsPanel type="creator" id={creator.id} fields={details} canEdit={canEdit} />
        <div className="card p-4">
          <div className="overline mb-2">Locations</div>
          <LinkChips
            canEdit={canEdit}
            items={locations.map((l) => ({ key: l.id, label: l.entity.name, sub: l.relationship ? labelFor(l.relationship) : undefined, href: `/explore/location/${l.entity.slug}`, removePayload: { kind: "creator_entity", creatorId: creator.id, entityId: l.entityId, relationship: l.relationship } }))}
            addConfig={{ template: chipTemplate, idField: "entityId", lookupType: "entity", lookupKind: "location", roleField: "relationship", roleOptions: LOCATION_RELATIONSHIPS, roleDefault: "based_in", createKind: "entity", buttonLabel: "+ Location" }}
            emptyMessage="No locations."
          />
        </div>
        {experience.length > 0 && (
          <div className="card p-4">
            <div className="overline mb-2">Experience</div>
            <ul className="space-y-1 text-sm">{experience.map((e) => <li key={e.label} className="flex justify-between"><span className="text-muted">{e.label}</span><span className="font-semibold">{e.count}</span></li>)}</ul>
          </div>
        )}
        {oppConnections.length > 0 && (
          <div className="card p-4">
            <div className="overline mb-2">Opportunity connections</div>
            <ul className="space-y-2 text-sm">
              {oppConnections.map((c) => (
                <li key={c.entity.id}>
                  <Link href={`/explore/${c.entity.kind}/${c.entity.slug}`} className="font-medium hover:text-accent-deep hover:underline">{c.entity.name}</Link>
                  <div className="text-xs text-muted">{c.creatorCount} other {c.creatorCount === 1 ? "creator" : "creators"} · {c.formatCount} {c.formatCount === 1 ? "format" : "formats"}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {related.length > 0 && (
          <div className="card p-4">
            <div className="overline mb-2">Related talent</div>
            <ul className="space-y-3">
              {related.map((r) => (
                <li key={r.id}>
                  <Link href={`/talent/${r.slug}`} className="flex items-center gap-2 font-medium hover:text-accent-deep"><Portrait name={r.name} imageUrl={r.imageUrl} className="h-7 w-7 shrink-0 rounded" textClass="text-xs" /><span className="truncate">{r.name}</span></Link>
                  <div className="ml-9 text-xs text-muted">{r.reasons.join(" · ")}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {tags.length > 0 && (
          <div className="card p-4">
            <div className="overline mb-2">Tags</div>
            <div className="flex flex-wrap gap-1.5">{tags.map((t) => <Chip key={t.id} href={`/explore/tag/${t.entity.slug}`}>{t.entity.name}</Chip>)}</div>
          </div>
        )}
      </>}>
        <RecordTabs path={path} tabs={tabs} current={tab} />

        {tab === "overview" && (
          <>
            <Highlights type="creator" id={creator.id} fields={highlights} canEdit={canEdit} />
            <UpdatePanel user={user} targetType="creator" targetId={creator.id} name={creator.name} path={path} recordType="talent profile" />
            <Section title="Bio">
              <InlineField type="creator" id={creator.id} field={fieldNamed(all, "miniBio")} canEdit={canEdit} className="text-sm leading-relaxed" placeholder="Who are they, in a paragraph?" />
            </Section>
            <Section title="Digital">
              <div className="mb-3"><InlineField type="creator" id={creator.id} field={fieldNamed(all, "digitalSummary")} canEdit={canEdit} className="text-sm leading-relaxed" placeholder="What is their digital presence like?" /></div>
              {creator.socialProfiles.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {creator.socialProfiles.map((s) => (
                    <div key={s.id} className="card flex items-center justify-between px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium">{socialLabel(s.platform)}</span>
                        {s.handle && <span className="ml-2 truncate text-muted">{s.url ? <a className="hover:text-accent-deep hover:underline" href={s.url} target="_blank" rel="noreferrer">@{s.handle}</a> : `@${s.handle}`}</span>}
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{s.followerCount != null ? compactNumber(s.followerCount) : "—"}{s.engagementRate != null && <span className="ml-1.5 text-xs font-medium text-muted">{s.engagementRate}% eng.</span>}</div>
                        {s.countUpdatedAt && <div className="text-xs text-faint">updated {relativeTime(s.countUpdatedAt)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {canEdit && <p className="mt-2 text-xs text-faint">Social handles and counts are edited on the <Link href={`${path}/edit`} className="underline underline-offset-2">full form</Link>.</p>}
            </Section>
            <Section title="Interests & Hobbies">
              <LinkChips canEdit={canEdit} items={interests.map((l) => ({ key: l.id, label: l.entity.name, href: `/explore/${l.entity.kind}/${l.entity.slug}`, removePayload: { kind: "creator_entity", creatorId: creator.id, entityId: l.entityId, relationship: l.relationship } }))} addConfig={{ template: chipTemplate, idField: "entityId", lookupType: "entity", lookupKind: "interest", createKind: "entity", buttonLabel: "+ Add interest" }} emptyMessage="No interests mapped yet." />
            </Section>
            <Section title="Sports">
              <LinkChips canEdit={canEdit} items={sports.map((l) => ({ key: l.id, label: l.entity.name, href: `/explore/sport/${l.entity.slug}`, removePayload: { kind: "creator_entity", creatorId: creator.id, entityId: l.entityId, relationship: l.relationship } }))} addConfig={{ template: chipTemplate, idField: "entityId", lookupType: "entity", lookupKind: "sport", createKind: "entity", buttonLabel: "+ Add sport" }} emptyMessage="No sports mapped yet." />
            </Section>
            <Section title="Opportunity Notes">
              <InlineField type="creator" id={creator.id} field={fieldNamed(all, "opportunityNotes")} canEdit={canEdit} className="text-sm leading-relaxed" placeholder="Why is this person interesting creatively or commercially?" />
            </Section>
            <Section title="Sources">
              <SourceList canEdit={canEdit} targetType="creator" targetId={creator.id} sources={recordSources.map((rs) => ({ recordSourceId: rs.id, title: rs.source.title, url: rs.source.url, sourceType: rs.source.sourceType }))} />
            </Section>
            <Section title="Attachments">
              <AttachmentList canEdit={canEdit} targetType="creator" targetId={creator.id} attachments={attachments} blobReady={limits.blob} maxBytes={limits.bytes} />
            </Section>
            <Section title="Internal Notes">
              <InlineField type="creator" id={creator.id} field={fieldNamed(all, "internalNotes")} canEdit={canEdit} className="text-sm leading-relaxed text-muted" placeholder="Add internal notes…" />
            </Section>
          </>
        )}

        {tab === "projects" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Project" columns={{ sub: "Type · Year", role: "Roles", extra: "Made by / on" }}
            rows={projects.map(({ project, roles }) => {
              const prodCo = project.organizations.find((o) => o.relationship === "production_company");
              const platform = project.organizations.find((o) => ["network", "streamer", "platform", "distributor"].includes(o.relationship));
              return {
                id: project.id, name: project.title, href: `/projects/${project.slug}`,
                sub: [labelFor(project.projectType), project.premiereYear].filter(Boolean).join(" · "),
                role: undefined,
                extra: (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <LinkChips canEdit={canEdit} items={roles.map((role) => ({ key: role, label: labelFor(role), removePayload: { kind: "creator_project", creatorId: creator.id, projectId: project.id, role } }))} />
                    {prodCo && <span className="text-xs text-muted">Prod: <Link className="hover:text-accent-deep hover:underline" href={`/organizations/${prodCo.organization.slug}`}>{prodCo.organization.name}</Link></span>}
                    {platform && <span className="text-xs text-muted">On: <Link className="hover:text-accent-deep hover:underline" href={`/organizations/${platform.organization.slug}`}>{platform.organization.name}</Link></span>}
                  </div>
                ),
              };
            })}
            addConfig={{ template: { kind: "creator_project", creatorId: creator.id }, idField: "projectId", lookupType: "project", roleField: "role", roleOptions: PROJECT_ROLES, createKind: "project", buttonLabel: "+ Add project", placeholder: "Search or create a project…" }}
            emptyMessage="No projects added yet."
          />
        )}
        {tab === "formats" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Format" columns={{ extra: "Status" }}
            rows={creator.formats.map((cf) => ({
              id: cf.id, name: cf.format.title, href: `/formats/${cf.format.slug}`,
              extra: <span className="flex items-center gap-2"><StatusPill status={cf.format.status} label={labelFor(cf.format.status)} />{cf.isPrimary && <span className="text-xs font-semibold uppercase tracking-wide text-accent-deep">Primary</span>}<KindBadge kind="format" /></span>,
              removePayload: { kind: "creator_format", creatorId: creator.id, formatId: cf.formatId },
            }))}
            addConfig={{ template: { kind: "creator_format", creatorId: creator.id }, idField: "formatId", lookupType: "format", createKind: "format", buttonLabel: "+ Attach format" }}
            emptyMessage="No 4.4.Forty formats attached yet."
          />
        )}
        {tab === "companies" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Company" columns={{ sub: "Group", role: "Relationship" }}
            rows={creator.organizations.map((o) => ({
              id: o.id, name: o.organization.name, href: `/organizations/${o.organization.slug}`, sub: orgGroup(o),
              role: [labelFor(o.relationship), o.status === "past" ? "past" : null].filter(Boolean).join(" · "),
              removePayload: { kind: "creator_org", creatorId: creator.id, organizationId: o.organizationId, relationship: o.relationship },
            }))}
            addConfig={{ template: { kind: "creator_org", creatorId: creator.id }, idField: "organizationId", lookupType: "organization", roleField: "relationship", roleOptions: CREATOR_ORG_RELATIONSHIPS, createKind: "organization", buttonLabel: "+ Add company" }}
            emptyMessage="No businesses, brands or other companies recorded."
          />
        )}
        {tab === "reps" && (
          <div>
            <RepList creatorId={creator.id} canEdit={canEdit} reps={creator.people.map((p) => ({
              id: p.id, personId: p.personId, relationship: p.relationship, current: p.current, start: p.start, end: p.end,
              person: { name: p.person.name, slug: p.person.slug, email: p.person.email, phone: p.person.phone, assistantName: p.person.assistantName, assistantEmail: p.person.assistantEmail, orgName: p.person.organizations[0]?.organization.name ?? null },
            }))} />
            <RelationTable canEdit={canEdit} autoOpen={autoLink} rows={[]} addConfig={{ template: { kind: "creator_person", creatorId: creator.id }, idField: "personId", lookupType: "person", roleField: "relationship", roleOptions: CREATOR_PERSON_RELATIONSHIPS, createKind: "person", buttonLabel: "+ Add rep" }} emptyMessage={creator.people.length ? "" : "No representation recorded."} />
          </div>
        )}
        {tab === "collaborators" && (
          <RelationTable
            canEdit={canEdit} autoOpen={autoLink} title="Talent" columns={{ role: "Relationship", sub: "Note" }}
            rows={collaborators.map((c) => ({ id: `${c.other.id}-${c.relationship}`, name: c.other.name, href: `/talent/${c.other.slug}`, role: labelFor(c.relationship), sub: c.note ?? undefined, removePayload: { kind: "creator_creator", creatorAId: c.aId, creatorBId: c.bId, relationship: c.relationship } }))}
            addConfig={{ template: { kind: "creator_creator", creatorAId: creator.id }, idField: "creatorBId", lookupType: "creator", roleField: "relationship", roleOptions: CREATOR_RELATIONSHIPS, buttonLabel: "+ Add collaborator" }}
            emptyMessage="No creator relationships recorded."
          />
        )}
        {tab === "opportunities" && (
          <RelationTable
            canEdit={canEdit} title="Opportunity" columns={{ sub: "Status", role: "Stage" }}
            rows={creator.opportunities.map((o) => ({ id: o.id, name: o.opportunity.title, href: `/opportunities/${o.opportunity.slug}`, sub: labelFor(o.opportunity.status), role: labelFor(o.status), removePayload: { kind: "opportunity_creator", opportunityId: o.opportunityId, creatorId: creator.id } }))}
            emptyMessage="Not under consideration for any opportunity. Add them from an opportunity's Talent tab."
          />
        )}
        {tab === "activity" && <RecordActivity type="creator" id={creator.id} />}
      </RecordLayout>

      <RecordFooter type="creator" id={creator.id} createdAt={creator.createdAt} updatedAt={creator.updatedAt} verifiedAt={creator.lastVerifiedAt} />
    </div>
  );
}
