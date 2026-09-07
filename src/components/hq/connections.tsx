import Link from "next/link";
import { backlinksTo, outlinksFrom, type Backlink, type Outlink } from "@/lib/hq/network";

// The network, shown: what names this thing (backlinks), and what this
// thing names (outlinks). Server component; the graph is read, not rendered
// from state.

const WORD: Record<string, string> = { note: "Note", idea: "Idea", interaction: "Conversation", task: "Task", pipeline: "Card", relationship: "Person" };

export async function Connections({ ownerId, target, source, title = "Comes up in" }: { ownerId: string; target: { targetType: string; targetId: string }; source?: { type: string; id: string }; title?: string }) {
  const [back, out]: [Backlink[], Outlink[]] = await Promise.all([backlinksTo(ownerId, target), source ? outlinksFrom(ownerId, source) : Promise.resolve([])]);
  if (!back.length && !out.length) return null;
  return (
    <section className="card p-4">
      {out.length > 0 && (
        <div className="mb-3">
          <div className="overline mb-1">Mentions</div>
          <div className="flex flex-wrap gap-1.5 text-sm">
            {out.map((o) => o.href ? <Link key={`${o.targetType}:${o.targetId}`} href={o.href} className="chip">{o.name}{o.targetKind ? <span className="ml-1 text-xs text-faint">{o.targetKind}</span> : null}</Link> : <span key={`${o.targetType}:${o.targetId}`} className="chip">{o.name}</span>)}
          </div>
        </div>
      )}
      {back.length > 0 && (
        <div>
          <div className="overline mb-1">{title}</div>
          <ul className="divide-y divide-line text-sm">
            {back.map((b) => (
              <li key={`${b.sourceType}:${b.sourceId}`} className="py-1.5">
                <span className="mr-2 text-xs uppercase tracking-wide text-faint">{WORD[b.sourceType] ?? b.sourceType}</span>
                <Link href={b.href} className="font-medium hover:text-accent">{b.title}</Link>
                {b.snippet && <span className="text-muted"> — {b.snippet}</span>}
                <span className="ml-1 text-xs text-faint">{b.when.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
