import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { YouTubeHeader } from "@/components/youtube-nav";
import { labelFor } from "@/lib/taxonomy";

export const metadata = { title: "YouTube Partners" };

// Who else is involved in the channels: the companies cutting them and the
// people to call about them, gathered across every channel rather than buried
// one page at a time.

export default async function YouTubePartnersPage() {
  await requireUser();

  const [orgLinks, personLinks] = await Promise.all([
    db.channelOrganization.findMany({
      where: { channel: { archived: false } },
      include: {
        organization: { select: { id: true, name: true, slug: true, types: true, location: true } },
        channel: { select: { name: true, slug: true } },
      },
    }),
    db.channelPerson.findMany({
      where: { channel: { archived: false } },
      include: {
        person: { select: { id: true, name: true, slug: true, title: true, email: true } },
        channel: { select: { name: true, slug: true } },
      },
    }),
  ]);

  // One row per company, listing every channel it touches — the useful shape
  // is "who is Bad Woods working on", not one row per link.
  const orgs = new Map<string, {
    name: string; slug: string; types: string[]; location: string | null;
    channels: { name: string; slug: string; relationship: string }[];
  }>();
  for (const l of orgLinks) {
    const entry = orgs.get(l.organization.id) ?? {
      name: l.organization.name, slug: l.organization.slug,
      types: l.organization.types, location: l.organization.location,
      channels: [],
    };
    entry.channels.push({ ...l.channel, relationship: l.relationship });
    orgs.set(l.organization.id, entry);
  }

  const people = new Map<string, {
    name: string; slug: string; title: string | null; email: string | null;
    channels: { name: string; slug: string; relationship: string }[];
  }>();
  for (const l of personLinks) {
    const entry = people.get(l.person.id) ?? {
      name: l.person.name, slug: l.person.slug,
      title: l.person.title, email: l.person.email,
      channels: [],
    };
    entry.channels.push({ ...l.channel, relationship: l.relationship });
    people.set(l.person.id, entry);
  }

  const empty = orgs.size === 0 && people.size === 0;

  return (
    <div>
      <YouTubeHeader active="/youtube/partners" />

      {empty ? (
        <div className="rounded-md border border-dashed border-line-strong bg-wash/50 px-6 py-10 text-center text-sm text-muted">
          Nobody attached to a channel yet. Open a channel and add the company cutting it or
          the person to call — they gather here.
        </div>
      ) : (
        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
          <section>
            <div className="mb-2 flex items-baseline gap-3">
              <h2 className="font-display text-xl font-bold">Companies</h2>
              <span className="text-sm text-muted">{orgs.size}</span>
            </div>
            <div className="space-y-1.5">
              {[...orgs.values()]
                .sort((a, b) => b.channels.length - a.channels.length || a.name.localeCompare(b.name))
                .map((o) => (
                  <div key={o.slug} className="card px-3.5 py-2.5">
                    <Link href={`/organizations/${o.slug}`} className="block text-sm font-semibold hover:text-accent">
                      {o.name}
                    </Link>
                    <div className="truncate text-xs text-muted">
                      {[o.types.map(labelFor).join(", "), o.location].filter(Boolean).join(" · ")}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {o.channels.map((c) => (
                        <Link key={`${c.slug}-${c.relationship}`} href={`/youtube/${c.slug}`} className="chip text-xs hover:text-accent-deep">
                          {c.name} <span className="text-faint">{labelFor(c.relationship)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              {orgs.size === 0 && <p className="text-sm text-faint">No companies attached yet.</p>}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-baseline gap-3">
              <h2 className="font-display text-xl font-bold">People</h2>
              <span className="text-sm text-muted">{people.size}</span>
            </div>
            <div className="space-y-1.5">
              {[...people.values()]
                .sort((a, b) => b.channels.length - a.channels.length || a.name.localeCompare(b.name))
                .map((p) => (
                  <div key={p.slug} className="card px-3.5 py-2.5">
                    <Link href={`/people/${p.slug}`} className="block text-sm font-semibold hover:text-accent">
                      {p.name}
                    </Link>
                    <div className="truncate text-xs text-muted">
                      {[p.title, p.email].filter(Boolean).join(" · ") || "No title on record"}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.channels.map((c) => (
                        <Link key={`${c.slug}-${c.relationship}`} href={`/youtube/${c.slug}`} className="chip text-xs hover:text-accent-deep">
                          {c.name} <span className="text-faint">{labelFor(c.relationship)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              {people.size === 0 && <p className="text-sm text-faint">No contacts attached yet.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
