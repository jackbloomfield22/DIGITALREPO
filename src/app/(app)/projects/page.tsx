import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { DirectoryControls, type DirChip } from "@/components/directory-controls";
import { KindBadge, StatusPill } from "@/components/ui";
import { PROJECT_ROLES, PROJECT_STATUSES, PROJECT_TYPES, labelFor } from "@/lib/taxonomy";

export const metadata = { title: "Projects" };

const PAGE_SIZE = 30;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(params.q)?.trim();
  const type = one(params.type);
  const status = one(params.status);
  const creatorId = one(params.creator);
  const role = one(params.role);
  const orgId = one(params.org);
  const entityId = one(params.entity);
  const year = one(params.year);
  const sort = one(params.sort) ?? "recent";
  const view = one(params.view) === "table" ? "table" : "cards";
  const page = Math.max(1, Number(one(params.page) ?? 1) || 1);

  const and: Prisma.ProjectWhereInput[] = [{ archived: false }];
  if (q) and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { aliases: { hasSome: [q] } }] });
  if (type) and.push({ projectType: type });
  if (status) and.push({ status });
  if (creatorId && role) and.push({ credits: { some: { creatorId, role } } });
  else if (creatorId) and.push({ credits: { some: { creatorId } } });
  else if (role) and.push({ credits: { some: { role } } });
  if (orgId) and.push({ organizations: { some: { organizationId: orgId } } });
  if (entityId) and.push({ entityLinks: { some: { entityId } } });
  if (year && Number(year)) and.push({ premiereYear: Number(year) });
  const where = { AND: and };

  const orderBy: Prisma.ProjectOrderByWithRelationInput[] =
    sort === "title" ? [{ title: "asc" }]
    : sort === "year" ? [{ premiereYear: "desc" }, { title: "asc" }]
    : sort === "updated" ? [{ updatedAt: "desc" }]
    : [{ createdAt: "desc" }];

  const [projects, total, creatorRecord, orgRecord, entityRecord] = await Promise.all([
    db.project.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        credits: { include: { creator: { select: { name: true, slug: true } } } },
        organizations: { include: { organization: { select: { name: true, slug: true } } } },
        entityLinks: { include: { entity: { select: { name: true } } } },
      },
    }),
    db.project.count({ where }),
    creatorId ? db.creator.findUnique({ where: { id: creatorId }, select: { name: true } }) : null,
    orgId ? db.organization.findUnique({ where: { id: orgId }, select: { name: true } }) : null,
    entityId ? db.entity.findUnique({ where: { id: entityId }, select: { name: true } }) : null,
  ]);

  const canEdit = hasRole(user, "EDITOR");
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const chips: DirChip[] = [
    ...(type ? [{ param: "type", value: type, label: labelFor(type) }] : []),
    ...(status ? [{ param: "status", value: status, label: labelFor(status) }] : []),
    ...(creatorRecord ? [{ param: "creator", value: creatorId!, label: creatorRecord.name }] : []),
    ...(role ? [{ param: "role", value: role, label: `Role: ${labelFor(role)}` }] : []),
    ...(orgRecord ? [{ param: "org", value: orgId!, label: orgRecord.name }] : []),
    ...(entityRecord ? [{ param: "entity", value: entityId!, label: entityRecord.name }] : []),
    ...(year ? [{ param: "year", value: year, label: year }] : []),
  ];

  const pageLink = (p: number) => {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "page" || value == null) continue;
      for (const v of Array.isArray(value) ? value : [value]) sp.append(key, v);
    }
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return `/projects${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <DirectoryControls
        title="PROJECTS"
        total={total}
        createHref="/projects/new"
        createLabel="+ Add Project"
        searchPlaceholder="Search projects…"
        canEdit={canEdit}
        viewToggle
        savedViewType="projects"
        chips={chips}
        sorts={[
          { value: "recent", label: "Recently Added" },
          { value: "updated", label: "Recently Updated" },
          { value: "title", label: "Alphabetical" },
          { value: "year", label: "Premiere Year" },
        ]}
        filters={[
          { param: "type", label: "Project Type", kind: "select", options: PROJECT_TYPES },
          { param: "status", label: "Status", kind: "select", options: PROJECT_STATUSES },
          { param: "creator", label: "Talent", kind: "lookup", lookupType: "creator" },
          { param: "role", label: "Talent Role", kind: "select", options: PROJECT_ROLES },
          { param: "org", label: "Company / Network / Brand", kind: "lookup", lookupType: "organization" },
          { param: "entity", label: "Genre / Topic", kind: "lookup", lookupType: "entity" },
        ]}
      />

      {projects.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong bg-wash/50 px-6 py-10 text-center text-sm text-muted">
          No projects match. {canEdit && <Link className="underline" href="/projects/new">Add one</Link>}
        </div>
      ) : view === "table" ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-3 py-2 font-semibold">Project</th>
                <th className="px-3 py-2 font-semibold">Type</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Year</th>
                <th className="px-3 py-2 font-semibold">Talent</th>
                <th className="px-3 py-2 font-semibold">Companies</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-wash/60">
                  <td className="px-3 py-2">
                    <Link href={`/projects/${p.slug}`} className="font-medium hover:text-accent-deep">
                      {p.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted">{labelFor(p.projectType)}</td>
                  <td className="px-3 py-2"><StatusPill status={p.status} label={labelFor(p.status)} /></td>
                  <td className="px-3 py-2 text-muted">{p.premiereYear ?? ""}</td>
                  <td className="max-w-52 truncate px-3 py-2 text-muted">
                    {[...new Set(p.credits.map((c) => c.creator.name))].join(", ")}
                  </td>
                  <td className="max-w-52 truncate px-3 py-2 text-muted">
                    {[...new Set(p.organizations.map((o) => o.organization.name))].join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const talent = [...new Map(p.credits.map((c) => [c.creator.slug, c.creator])).values()];
            const prodCo = p.organizations.find((o) => o.relationship === "production_company");
            const platform = p.organizations.find((o) => ["network", "streamer", "platform", "distributor"].includes(o.relationship));
            return (
              <Link key={p.id} href={`/projects/${p.slug}`} className="card block p-4 transition-shadow hover:shadow-pop">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-display text-base font-bold leading-snug">{p.title}</div>
                  <KindBadge kind="project" />
                </div>
                <div className="mt-1 text-xs text-muted">
                  {[labelFor(p.projectType), p.premiereYear, p.seasons ? `${p.seasons} seasons` : null].filter(Boolean).join(" · ")}
                </div>
                {p.logline && <p className="mt-2 line-clamp-2 text-sm text-charcoal">{p.logline}</p>}
                <div className="mt-2 space-y-0.5 text-xs text-muted">
                  {talent.length > 0 && <div className="truncate">Talent: {talent.map((t) => t.name).join(", ")}</div>}
                  {prodCo && <div className="truncate">Prod: {prodCo.organization.name}</div>}
                  {platform && <div className="truncate">On: {platform.organization.name}</div>}
                </div>
                <div className="mt-2"><StatusPill status={p.status} label={labelFor(p.status)} /></div>
              </Link>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-2 text-sm">
          {page > 1 && <Link className="btn btn-secondary btn-sm" href={pageLink(page - 1)}>← Previous</Link>}
          <span className="px-2 text-muted">Page {page} of {pages}</span>
          {page < pages && <Link className="btn btn-secondary btn-sm" href={pageLink(page + 1)}>Next →</Link>}
        </nav>
      )}
    </div>
  );
}
