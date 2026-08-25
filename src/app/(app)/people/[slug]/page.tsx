import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DeleteRecordButton } from "@/components/delete-record-button";
import { requireUser, hasRole } from "@/lib/auth";
import { recordRecentView } from "@/lib/actions/misc";
import { Portrait, Section } from "@/components/ui";
import { LinkChips } from "@/components/link-editor";
import { labelFor } from "@/lib/taxonomy";
import { relativeTime } from "@/lib/format";

export default async function PersonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const person = await db.industryPerson.findUnique({
    where: { slug },
    include: {
      organizations: { include: { organization: { select: { id: true, name: true, slug: true } } } },
      creators: { include: { creator: { select: { id: true, name: true, slug: true, imageUrl: true } } } },
      projects: { include: { project: { select: { id: true, title: true, slug: true } } } },
    },
  });
  if (!person || person.archived) notFound();

  const canEdit = hasRole(user, "EDITOR");
  await recordRecentView(user.id, "person", person.id);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{person.name}</h1>
          <div className="mt-1 text-sm text-muted">
            {[person.title, labelFor(person.roleType)].filter(Boolean).join(" · ")}
            {person.organizations[0] && (
              <>
                {" · "}
                <Link href={`/organizations/${person.organizations[0].organization.slug}`} className="hover:text-accent-deep hover:underline">
                  {person.organizations[0].organization.name}
                </Link>
              </>
            )}
          </div>
        </div>
        {canEdit && (
          <span className="flex gap-2">
            <Link href={`/people/${person.slug}/edit`} className="btn btn-primary btn-sm">Edit</Link>
            <DeleteRecordButton targetType="person" id={person.id} label={person.name} />
          </span>
        )}
      </div>

      <div className="max-w-3xl">
        {(person.email || person.phone || person.contactUrl || person.assistantName || person.assistantEmail) && (
          <Section title="Contact">
            <div className="card space-y-1 px-4 py-3 text-sm">
              {person.email && (
                <div>
                  <span className="text-muted">Email · </span>
                  <a href={`mailto:${person.email}`} className="hover:text-accent-deep hover:underline">{person.email}</a>
                </div>
              )}
              {person.phone && (
                <div>
                  <span className="text-muted">Phone · </span>
                  <a href={`tel:${person.phone}`} className="hover:text-accent-deep hover:underline">{person.phone}</a>
                </div>
              )}
              {person.contactUrl && (
                <div>
                  <span className="text-muted">Link · </span>
                  <a href={person.contactUrl} target="_blank" rel="noreferrer" className="break-all hover:text-accent-deep hover:underline">{person.contactUrl}</a>
                </div>
              )}
              {(person.assistantName || person.assistantEmail) && (
                <div>
                  <span className="text-muted">Assistant · </span>
                  {person.assistantName}
                  {person.assistantEmail && (
                    <>
                      {person.assistantName ? " — " : ""}
                      <a href={`mailto:${person.assistantEmail}`} className="hover:text-accent-deep hover:underline">{person.assistantEmail}</a>
                    </>
                  )}
                </div>
              )}
            </div>
          </Section>
        )}

        <Section title="Represented / Connected Talent">
          <div className="space-y-2">
            {person.creators.map((cp) => (
              <div key={cp.id} className="card flex items-center justify-between gap-2 px-4 py-2.5">
                <Link href={`/talent/${cp.creator.slug}`} className="flex min-w-0 items-center gap-2.5 font-semibold hover:text-accent-deep">
                  <Portrait name={cp.creator.name} imageUrl={cp.creator.imageUrl} className="h-8 w-8 shrink-0 rounded" textClass="text-[11px]" />
                  <span className="truncate">{cp.creator.name}</span>
                </Link>
                <span className="text-xs text-muted">
                  {labelFor(cp.relationship)}
                  {!cp.current && <span className="ml-1.5 rounded bg-wash px-1 py-0.5 text-[10px] uppercase tracking-wide">Past</span>}
                </span>
              </div>
            ))}
            {person.creators.length === 0 && <p className="text-sm text-faint">No talent connected yet.</p>}
          </div>
        </Section>

        <Section title="Projects">
          <LinkChips
            canEdit={canEdit}
            items={person.projects.map((pp) => ({
              key: pp.id,
              label: pp.project.title,
              sub: labelFor(pp.role),
              href: `/projects/${pp.project.slug}`,
              removePayload: { kind: "project_person", projectId: pp.projectId, personId: person.id, role: pp.role },
            }))}
            emptyMessage="No project credits recorded."
          />
        </Section>

        <Section title="Organizations">
          <LinkChips
            canEdit={false}
            items={person.organizations.map((po) => ({
              key: po.id,
              label: po.organization.name,
              sub: po.role ?? undefined,
              href: `/organizations/${po.organization.slug}`,
            }))}
            emptyMessage="No organization mapped."
          />
        </Section>

        {person.notes && (
          <Section title="Notes">
            <p className="whitespace-pre-line text-sm text-muted">{person.notes}</p>
          </Section>
        )}

        <p className="text-xs text-faint">Updated {relativeTime(person.updatedAt)}</p>
      </div>
    </div>
  );
}
