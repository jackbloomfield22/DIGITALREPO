import { db } from "@/lib/db";
import { Section } from "@/components/ui";
import { RebuildDigestsButton } from "@/components/admin/rebuild-digests-button";
import { RAW_CAP_BYTES } from "@/lib/ingest/storage";
import { PROPOSE_MODEL, TRIAGE_MODEL, ingestAiAvailable } from "@/lib/ingest/ai";
import { labelFor } from "@/lib/taxonomy";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Ingest Admin" };

type Usage = Record<string, { model: string; inputTokens: number; outputTokens: number; calls: number }> | null;

export default async function AdminIngestPage() {
  const [statusGroups, digestCount, digestLatest, items] = await Promise.all([
    db.ingestItem.groupBy({ by: ["status"], _count: true }),
    db.knowledgeDigest.count(),
    db.knowledgeDigest.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    db.ingestItem.findMany({ select: { tokenUsage: true } }),
  ]);

  const totals = new Map<string, { model: string; input: number; output: number; calls: number }>();
  for (const item of items) {
    const usage = item.tokenUsage as Usage;
    if (!usage) continue;
    for (const [stage, u] of Object.entries(usage)) {
      const entry = totals.get(stage) ?? { model: u.model, input: 0, output: 0, calls: 0 };
      entry.input += u.inputTokens ?? 0;
      entry.output += u.outputTokens ?? 0;
      entry.calls += u.calls ?? 0;
      totals.set(stage, entry);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 font-display text-3xl font-bold tracking-tight">INGEST ADMIN</h1>

      <Section title="Pipeline">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {statusGroups.map((group) => (
            <div key={group.status} className="card px-3 py-2.5 text-center">
              <div className="font-display text-xl font-bold">{group._count}</div>
              <div className="text-xs text-muted">{labelFor(group.status)}</div>
            </div>
          ))}
          {statusGroups.length === 0 && <p className="text-sm text-faint">No items ingested yet.</p>}
        </div>
      </Section>

      <Section title="Token Spend">
        {totals.size === 0 ? (
          <p className="text-sm text-faint">No model calls recorded yet.</p>
        ) : (
          <div className="card divide-y divide-line text-sm">
            {[...totals.entries()].map(([stage, t]) => (
              <div key={stage} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="font-medium">{labelFor(stage)}</span>
                <span className="text-xs text-muted">{t.model} · {t.calls} calls</span>
                <span className="text-xs">
                  {(t.input / 1000).toFixed(1)}k in / {(t.output / 1000).toFixed(1)}k out
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Knowledge Digest" action={<RebuildDigestsButton />}>
        <div className="card p-4 text-sm">
          <div className="flex justify-between py-1"><span className="text-muted">Indexed records</span><span className="font-semibold">{digestCount}</span></div>
          <div className="flex justify-between py-1"><span className="text-muted">Last refresh</span><span>{digestLatest ? relativeTime(digestLatest.updatedAt) : "never"}</span></div>
          <p className="mt-2 text-xs text-faint">
            Digests refresh automatically on every edit, link, merge, and apply. A rebuild is
            only needed after a restore or bulk import that bypassed the app.
          </p>
        </div>
      </Section>

      <Section title="Configuration">
        <div className="card p-4 text-sm">
          <div className="flex justify-between py-1"><span className="text-muted">AI configured</span><span className="font-semibold">{ingestAiAvailable() ? "Yes" : "No — parsing only"}</span></div>
          <div className="flex justify-between py-1"><span className="text-muted">Triage model</span><span>{TRIAGE_MODEL} <span className="text-faint">(AI_MODEL_TRIAGE)</span></span></div>
          <div className="flex justify-between py-1"><span className="text-muted">Propose model</span><span>{PROPOSE_MODEL} <span className="text-faint">(AI_MODEL)</span></span></div>
          <div className="flex justify-between py-1"><span className="text-muted">Raw file retention cap</span><span>{(RAW_CAP_BYTES / 1024 / 1024).toFixed(0)}MB <span className="text-faint">(INGEST_RAW_CAP_MB)</span></span></div>
        </div>
      </Section>
    </div>
  );
}
