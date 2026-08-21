import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Portrait } from "@/components/ui";
import { PrintButton } from "@/components/profile-chrome";
import { labelFor, socialLabel } from "@/lib/taxonomy";
import { ageFrom, compactNumber, totalAudience } from "@/lib/format";

export const metadata = { title: "One-Sheet" };

// Clean print view — replaces the old Google Docs one-sheet workflow.
export default async function OneSheetPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireUser();
  const { slug } = await params;
  const creator = await db.creator.findUnique({
    where: { slug },
    include: {
      socialProfiles: { orderBy: { followerCount: "desc" } },
      entityLinks: { include: { entity: true } },
      credits: { include: { project: { select: { id: true, title: true, premiereYear: true, projectType: true } } } },
      organizations: { include: { organization: { select: { name: true } } } },
      people: { include: { person: { include: { organizations: { include: { organization: { select: { name: true } } } } } } } },
      formats: { include: { format: { select: { title: true, status: true } } } },
    },
  });
  if (!creator) notFound();

  const byKind = (kind: string) => creator.entityLinks.filter((l) => l.entity.kind === kind);
  const categories = byKind("creator_category").map((l) => l.entity.name);
  const basedIn = byKind("location").find((l) => l.relationship === "based_in") ?? byKind("location")[0];
  const interests = [...byKind("sport"), ...byKind("interest"), ...byKind("hobby")].map((l) => l.entity.name);
  const age = ageFrom(creator.birthday, creator.age);

  const projectMap = new Map<string, { title: string; year: number | null; type: string | null; roles: string[] }>();
  for (const c of creator.credits) {
    const e = projectMap.get(c.project.id) ?? { title: c.project.title, year: c.project.premiereYear, type: c.project.projectType, roles: [] };
    e.roles.push(labelFor(c.role));
    projectMap.set(c.project.id, e);
  }

  return (
    <div className="mx-auto max-w-2xl bg-white print:max-w-none">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/creators/${creator.slug}`} className="text-sm text-muted hover:text-accent">
          ← Back to profile
        </Link>
        <PrintButton />
      </div>

      <div className="flex items-start gap-6 border-b-2 border-ink pb-5">
        <Portrait name={creator.name} imageUrl={creator.imageUrl} className="h-32 w-32 shrink-0 rounded" textClass="text-4xl" />
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide">{creator.name}</h1>
          <div className="mt-1 text-sm font-medium text-charcoal">{categories.join(" / ")}</div>
          <div className="mt-0.5 text-sm text-muted">
            {[age, basedIn?.entity.name].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-1 text-sm font-semibold">
            {compactNumber(totalAudience(creator.socialProfiles))} total listed audience
          </div>
        </div>
      </div>

      <div className="space-y-5 py-5">
        {creator.socialProfiles.length > 0 && (
          <section>
            <h2 className="overline mb-1.5">Social</h2>
            <table className="w-full text-sm">
              <tbody>
                {creator.socialProfiles.map((s) => (
                  <tr key={s.id}>
                    <td className="py-0.5 pr-4 text-muted">{socialLabel(s.platform)}</td>
                    <td className="py-0.5 pr-4">{s.handle ? `@${s.handle}` : ""}</td>
                    <td className="py-0.5 text-right font-semibold">
                      {s.followerCount != null ? compactNumber(s.followerCount) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {creator.people.length > 0 && (
          <section>
            <h2 className="overline mb-1.5">Representation</h2>
            <p className="text-sm">
              {creator.people
                .map((p) => `${p.person.name} (${labelFor(p.relationship)}${p.person.organizations[0] ? `, ${p.person.organizations[0].organization.name}` : ""})`)
                .join(" · ")}
            </p>
          </section>
        )}

        {creator.miniBio && (
          <section>
            <h2 className="overline mb-1.5">Bio</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed">{creator.miniBio}</p>
          </section>
        )}

        {interests.length > 0 && (
          <section>
            <h2 className="overline mb-1.5">Interests</h2>
            <p className="text-sm">{interests.join(" · ")}</p>
          </section>
        )}

        {creator.organizations.length > 0 && (
          <section>
            <h2 className="overline mb-1.5">Brands & Business</h2>
            <p className="text-sm">
              {creator.organizations.map((o) => `${o.organization.name} (${labelFor(o.relationship)})`).join(" · ")}
            </p>
          </section>
        )}

        {creator.digitalSummary && (
          <section>
            <h2 className="overline mb-1.5">Digital</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed">{creator.digitalSummary}</p>
          </section>
        )}

        {projectMap.size > 0 && (
          <section>
            <h2 className="overline mb-1.5">Projects</h2>
            <ul className="space-y-1 text-sm">
              {[...projectMap.values()].map((p) => (
                <li key={p.title}>
                  <span className="font-medium">{p.title}</span>
                  <span className="text-muted">
                    {" "}— {p.roles.join(", ")}
                    {p.year ? ` · ${p.year}` : ""}
                    {p.type ? ` · ${labelFor(p.type)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {creator.formats.length > 0 && (
          <section>
            <h2 className="overline mb-1.5">4.4.Forty Formats</h2>
            <ul className="space-y-1 text-sm">
              {creator.formats.map((f) => (
                <li key={f.id}>
                  <span className="font-medium">{f.format.title}</span>
                  <span className="text-muted"> — {labelFor(f.format.status)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
