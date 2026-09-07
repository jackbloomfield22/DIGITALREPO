import Link from "next/link";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/hq/owner";
import { HqFrame } from "@/components/hq/nav";
import { searchBrain } from "@/lib/hq/search";
import { askAvailable, spendToday } from "@/lib/hq/ask";
import { AskBrain } from "@/components/hq/ask-brain";
import { NewNoteButton } from "@/components/hq/note-editor";
import { NOTE_KINDS, hqLabel, plural } from "@/lib/hq/vocab";

export const metadata = { title: "HQ · Brain" };
export const dynamic = "force-dynamic";

const SOURCE_WORD: Record<string, string> = { note: "Note", idea: "Idea", task: "Task", interaction: "Conversation", relationship: "Person", pipeline: "Card", style: "Style example", repo: "Repo" };

function Snippet({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g);
  return <>{parts.map((p, i) => (p.startsWith("«") ? <mark key={i} className="rounded bg-[#f5efdd] px-0.5">{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>))}</>;
}

export default async function BrainPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; ask?: string }> }) {
  const user = await requireOwner();
  const { q = "", kind = "" } = await searchParams;
  const [result, notes, settings, spent, counts] = await Promise.all([
    q ? searchBrain(user.id, q) : null,
    db.hqNote.findMany({ where: { ownerId: user.id, ...(kind ? { kind } : {}) }, orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }], take: 60, select: { id: true, title: true, kind: true, tags: true, pinned: true, updatedAt: true, body: true } }),
    db.hqSettings.findUnique({ where: { ownerId: user.id } }),
    spendToday(user.id),
    Promise.all([db.hqNote.count({ where: { ownerId: user.id } }), db.hqIdea.count({ where: { ownerId: user.id } }), db.knowledgeDigest.count()]),
  ]);
  const aiOn = !!settings?.aiEnabled && askAvailable();

  return (
    <HqFrame active="/hq/brain">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Brain</h1>
          <p className="text-sm text-muted">{plural(counts[0], "note")} · {plural(counts[1], "idea")} · {plural(counts[2], "Repo record")}, all searchable together.</p>
        </div>
        <NewNoteButton />
      </div>

      <form action="/hq/brain" className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Ask it like a question — “what athletes have we discussed for prank formats?”, “filmmakers we liked for Point Guard”, “email templates”" className="flex-1" autoFocus={!q} />
        <button className="btn btn-primary">Search</button>
      </form>

      {result && (
        <section className="mb-6">
          <div className="mb-2 text-xs text-faint">
            Searched for <span className="text-charcoal">{result.terms || result.query}</span>
            {result.hints.length > 0 && <> · looking for {result.hints.map((h) => ({ creator: "talent", person: "people", format: "formats", project: "projects", organization: "companies", channel: "channels", template: "templates", meeting: "meetings" }[h] ?? h)).join(", ")}</>}
            {" · "}{result.total} hit{result.total === 1 ? "" : "s"}
          </div>
          {result.answer.length > 0 && (
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              {result.answer.map((b) => (
                <div key={b.heading} className="card p-4">
                  <div className="overline mb-1.5">{b.heading}</div>
                  <ul className="space-y-1 text-sm">
                    {b.items.map((it, i) => (
                      <li key={i}>
                        {it.href ? <Link href={it.href} className="font-medium hover:text-accent">{it.name}</Link> : <span className="font-medium">{it.name}</span>}
                        {it.detail && <span className="text-muted"> — {it.detail}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {result.hits.length === 0 ? (
            <div className="card p-4 text-sm text-muted">Nothing in the brain matches. Try fewer words, or a name.</div>
          ) : (
            <ul className="card divide-y divide-line">
              {result.hits.map((h) => (
                <li key={`${h.source}:${h.id}`} className="px-4 py-2.5 text-sm">
                  <div className="flex items-baseline gap-2">
                    <span className="w-24 shrink-0 text-xs uppercase tracking-wide text-faint">{SOURCE_WORD[h.source]}{h.source === "repo" ? ` · ${h.kind}` : ""}</span>
                    <Link href={h.href} className="font-medium hover:text-accent">{h.title}</Link>
                    {h.source !== "repo" && <span className="text-xs text-faint">{h.kind.replace(/_/g, " ")}</span>}
                  </div>
                  {h.snippet && <div className="pl-[6.5rem] text-muted"><Snippet text={h.snippet} /></div>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {aiOn && <div className="mb-6"><AskBrain initial={q} capCents={settings!.aiDailyCapCents} spentCents={spent} /></div>}

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="overline mr-1">Notes</span>
          <Link href="/hq/brain" className={`chip ${!kind ? "chip-on" : ""}`}>All</Link>
          {NOTE_KINDS.map((k) => <Link key={k.value} href={`/hq/brain?kind=${k.value}`} className={`chip ${kind === k.value ? "chip-on" : ""}`}>{k.label}</Link>)}
        </div>
        {notes.length === 0 ? (
          <div className="card p-5 text-sm text-muted">No notes yet. Meeting notes, research, pitches, talent lists, email templates — anything you&rsquo;d want to find again.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {notes.map((n) => (
              <Link key={n.id} href={`/hq/brain/${n.id}`} className="card block p-3.5 hover:border-line-strong">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{n.pinned && <span className="mr-1 text-accent" title="Pinned">●</span>}{n.title}</span>
                  <span className="shrink-0 text-xs text-faint">{hqLabel(NOTE_KINDS, n.kind)}</span>
                </div>
                <div className="mt-1 line-clamp-3 text-sm text-muted">{n.body.slice(0, 240) || "—"}</div>
                <div className="mt-1.5 text-xs text-faint">{n.updatedAt.toLocaleDateString()}{n.tags.length ? ` · ${n.tags.join(", ")}` : ""}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </HqFrame>
  );
}
