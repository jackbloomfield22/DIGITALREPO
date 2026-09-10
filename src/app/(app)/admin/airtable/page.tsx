import Link from "next/link";
import { db } from "@/lib/db";
import { Section } from "@/components/ui";
import { airtableConfig, airtableToken } from "@/lib/airtable/config";
import { AirtableControls, AirtableSettingsForm } from "@/components/admin/airtable-admin";
import { relativeTime } from "@/lib/format";
import { airtableRecordUrl } from "@/lib/airtable/fields";

export const metadata = { title: "Airtable" };

export default async function AirtableAdminPage() {
  const cfg = await airtableConfig();
  const tokenPresent = !!airtableToken();
  const [synced, queued, failed, recent, problems] = await Promise.all([
    db.airtableSync.count(),
    db.airtableJob.count({ where: { attempts: { lt: 6 } } }),
    db.airtableJob.count({ where: { attempts: { gt: 0 } } }),
    db.airtableSync.findMany({ orderBy: { updatedAt: "desc" }, take: 8 }),
    db.airtableJob.findMany({ where: { lastError: { not: null } }, orderBy: { updatedAt: "desc" }, take: 8 }),
  ]);
  const setting = await db.appSetting.findUnique({ where: { key: "airtable" } });
  const storedBase = ((setting?.value ?? {}) as { baseId?: string }).baseId ?? "";
  const names = new Map<string, string>();
  if (recent.length || problems.length) {
    const ids = [...recent, ...problems];
    const [fs, ps] = await Promise.all([
      db.format.findMany({ where: { id: { in: ids.filter((r) => r.targetType === "format").map((r) => r.targetId) } }, select: { id: true, title: true, slug: true } }),
      db.project.findMany({ where: { id: { in: ids.filter((r) => r.targetType === "project").map((r) => r.targetId) } }, select: { id: true, title: true, slug: true } }),
    ]);
    for (const f of fs) names.set(`format:${f.id}`, `${f.title}|/formats/${f.slug}`);
    for (const p of ps) names.set(`project:${p.id}`, `${p.title}|/projects/${p.slug}`);
  }
  const nameOf = (t: string, id: string) => names.get(`${t}:${id}`)?.split("|") ?? [`${t} ${id.slice(0, 8)}`, null];

  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 font-display text-3xl font-bold tracking-tight">AIRTABLE</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Every format and project is mirrored to a row in the company Airtable base, with its files. The Repo is the
        source of truth and pushes one way: edit here, and Airtable follows within seconds. Details in{" "}
        <code className="text-xs">docs/airtable.md</code>.
      </p>

      <Section title="Status">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[["Token", tokenPresent ? "set" : "missing"], ["Base", cfg.baseId || "not set"], ["Rows in Airtable", synced], ["Waiting to push", queued]].map(([label, n]) => (
            <div key={String(label)} className="card px-3 py-2.5 text-center">
              <div className="truncate font-display text-lg font-bold" title={String(n)}>{String(n)}</div>
              <div className="text-xs text-muted">{label}</div>
            </div>
          ))}
        </div>
        {!tokenPresent && (
          <p className="mt-3 text-sm text-accent-deep">
            No token yet. In Airtable, create a personal access token (Account → Developer hub → Personal access tokens) with the scopes
            data.records:read, data.records:write, schema.bases:read and schema.bases:write, give it access to the base, then add it in Vercel as
            AIRTABLE_TOKEN and redeploy.
          </p>
        )}
      </Section>

      <Section title="Where it goes">
        <AirtableSettingsForm initial={{
          baseId: storedBase,
          formatsTable: cfg.tables.format,
          projectsTable: cfg.tables.project,
          formatsOn: cfg.enabled.format,
          projectsOn: cfg.enabled.project,
          baseFromEnv: !!process.env.AIRTABLE_BASE_ID,
        }} />
      </Section>

      <Section title="Connection & sync">
        <AirtableControls tokenPresent={tokenPresent} queued={queued} failed={failed} />
      </Section>

      {problems.length > 0 && (
        <Section title="Needs attention">
          <ul className="space-y-1.5 text-sm">
            {problems.map((j) => {
              const [name, href] = nameOf(j.targetType, j.targetId);
              return (
                <li key={j.id} className="flex flex-wrap items-baseline gap-2">
                  {href ? <Link href={href} className="font-medium hover:text-accent">{name}</Link> : <span className="font-medium">{name}</span>}
                  <span className="text-xs text-faint">{j.attempts} attempt{j.attempts === 1 ? "" : "s"}</span>
                  <span className="text-xs text-accent-deep">{j.lastError}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="Recently pushed">
        {recent.length === 0 ? (
          <p className="text-sm text-faint">Nothing has been pushed yet.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {recent.map((s) => {
              const [name, href] = nameOf(s.targetType, s.targetId);
              return (
                <li key={s.id} className="flex flex-wrap items-baseline gap-2">
                  {href ? <Link href={href} className="font-medium hover:text-accent">{name}</Link> : <span className="font-medium">{name}</span>}
                  <a href={airtableRecordUrl(cfg.baseId, s.tableId, s.recordId)} target="_blank" rel="noreferrer" className="text-xs underline decoration-dotted underline-offset-2 hover:text-accent">row ↗</a>
                  <span className="text-xs text-faint">{s.syncedAt ? relativeTime(s.syncedAt) : "—"}</span>
                  {s.error && <span className="text-xs text-accent-deep">{s.error}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
