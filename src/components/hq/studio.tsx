"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addStyleExample, deleteStyleExample, saveStyleGuide } from "@/lib/actions/hq";
import { AutoText } from "@/components/hq/fields";
import { CardPicker, PersonPicker } from "@/components/hq/pickers";
import { STYLE_KINDS, hqLabel } from "@/lib/hq/vocab";

export function StyleGuideEditor({ value }: { value: string }) {
  return <AutoText value={value} multiline rows={18} onSave={(v) => saveStyleGuide(v)} className="[&_textarea]:font-mono [&_textarea]:text-[13px] [&_textarea]:leading-relaxed" />;
}

export function ExamplesLibrary({ examples }: { examples: { id: string; kind: string; title: string; body: string; notes: string | null; createdAt: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("logline");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    const form = new FormData(); form.set("file", file);
    const r = await fetch("/api/hq/style-upload", { method: "POST", body: form }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r || r.error) { alert(r?.error ?? "Could not read that file."); return; }
    setTitle((t) => t || r.title); setBody(r.text); setOpen(true);
    if (/deck|pitch/i.test(file.name) || file.name.endsWith(".pptx")) setKind("deck");
  };
  const save = () => start(async () => {
    const r = await addStyleExample({ kind, title: title.trim() || "Untitled", body: body.trim(), notes: notes.trim() || null });
    if (r.ok) { setTitle(""); setBody(""); setNotes(""); setOpen(false); router.refresh(); }
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-secondary btn-sm" onClick={() => setOpen((o) => !o)}>{open ? "Close" : "+ Paste an example"}</button>
        <label className="btn btn-secondary btn-sm cursor-pointer">
          {busy ? "Reading…" : "Upload a deck or doc"}
          <input type="file" className="hidden" accept=".pdf,.docx,.pptx,.txt,.md,.eml" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
        </label>
        <span className="text-xs text-faint">Decks, one-sheets, loglines you&rsquo;re proud of, emails that landed. The brief builder quotes the best fit.</span>
      </div>
      {open && (
        <div className="card mb-4 space-y-2 p-4">
          <div className="flex gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="!w-auto text-sm">{STYLE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Grit City deck v3, Netflix follow-up to Dana)" className="flex-1 text-sm" />
          </div>
          <textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} placeholder="The text itself." className="w-full text-sm" />
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why this one works (optional) — the writer reads this too" className="w-full text-sm" />
          <div className="flex justify-end"><button className="btn btn-primary btn-sm" disabled={pending || !body.trim()} onClick={save}>Save example</button></div>
        </div>
      )}
      {examples.length === 0 ? (
        <div className="text-sm text-faint">No examples yet. The style guide alone gets you a long way; three good examples get you your voice.</div>
      ) : (
        <ul className="divide-y divide-line">
          {examples.map((e) => (
            <li key={e.id} className="py-2 text-sm">
              <div className="flex items-baseline gap-2">
                <span className="w-28 shrink-0 text-xs uppercase tracking-wide text-faint">{hqLabel(STYLE_KINDS, e.kind)}</span>
                <button className="font-medium hover:text-accent" onClick={() => setExpanded((x) => (x === e.id ? null : e.id))}>{e.title}</button>
                <span className="text-xs text-faint">{e.body.length.toLocaleString()} chars</span>
                <button className="ml-auto text-xs text-faint hover:text-[#8a3a30]" onClick={() => start(async () => { await deleteStyleExample(e.id); router.refresh(); })}>×</button>
              </div>
              {expanded === e.id && <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-wash p-3 text-xs">{e.body}</pre>}
              {e.notes && <div className="pl-[7.5rem] text-xs text-muted">{e.notes}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BriefBuilder({ outputs, aiOn }: { outputs: { value: string; label: string }[]; aiOn: boolean }) {
  const [output, setOutput] = useState(outputs[0]?.value ?? "logline");
  const [card, setCard] = useState<{ id: string; title: string } | null>(null);
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [extra, setExtra] = useState("");
  const [brief, setBrief] = useState("");
  const [draft, setDraft] = useState<{ text: string; cents: number } | null>(null);
  const [busy, setBusy] = useState<"brief" | "draft" | null>(null);
  const [copied, setCopied] = useState(false);

  const build = async () => {
    setBusy("brief"); setDraft(null);
    const r = await fetch(`/api/hq/brief?${new URLSearchParams({ output, pipelineId: card?.id ?? "", relationshipId: person?.id ?? "", extra })}`).then((x) => x.json()).catch(() => null);
    setBrief(r?.brief ?? "Could not build the brief."); setBusy(null);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(brief); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };
  const run = async () => {
    setBusy("draft");
    const r = await fetch("/api/hq/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief }) }).then((x) => x.json()).catch(() => null);
    setBusy(null);
    if (r?.ok) setDraft({ text: r.text, cents: r.costCents }); else alert(r?.error ?? "Drafting failed.");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <div className="space-y-3">
        <label className="block"><span className="overline mb-1 block">What to write</span>
          <select value={output} onChange={(e) => setOutput(e.target.value)} className="w-full text-sm">{outputs.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </label>
        <div><span className="overline mb-1 block">For which project</span>
          {card ? <div className="text-sm">{card.title} <button className="text-xs text-faint hover:text-[#8a3a30]" onClick={() => setCard(null)}>×</button></div> : <CardPicker onPick={setCard} placeholder="Pipeline card (optional)" />}
        </div>
        <div><span className="overline mb-1 block">To whom</span>
          {person ? <div className="text-sm">{person.name} <button className="text-xs text-faint hover:text-[#8a3a30]" onClick={() => setPerson(null)}>×</button></div> : <PersonPicker onPick={(p) => { if (p.relationshipId) setPerson({ id: p.relationshipId, name: p.name }); }} placeholder="Person (for emails, optional)" />}
        </div>
        <label className="block"><span className="overline mb-1 block">Anything else</span>
          <textarea rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Angle, length, what to avoid, what they said last time…" className="w-full text-sm" />
        </label>
        <button className="btn btn-primary w-full" disabled={busy !== null} onClick={build}>{busy === "brief" ? "Building…" : "Build the brief"}</button>
        <p className="text-xs text-faint">The brief carries your style guide, the best-fit examples, and everything HQ knows about the project and the person. Paste it to Claude in chat and the draft costs nothing.</p>
      </div>
      <div>
        {brief ? (
          <>
            <div className="mb-1 flex items-center justify-between">
              <span className="overline">Brief</span>
              <div className="flex gap-2">
                <button className="btn btn-secondary btn-sm" onClick={copy}>{copied ? "Copied" : "Copy for Claude"}</button>
                {aiOn && <button className="btn btn-primary btn-sm" disabled={busy !== null} onClick={run}>{busy === "draft" ? "Drafting…" : "Draft here (costs a few cents)"}</button>}
              </div>
            </div>
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={18} className="w-full font-mono text-xs leading-relaxed" />
            {draft && (
              <div className="card mt-3 p-4">
                <div className="mb-1 flex items-baseline justify-between"><span className="overline">Draft</span><span className="text-xs text-faint">{draft.cents < 1 ? "<1¢" : `${draft.cents}¢`}</span></div>
                <pre className="whitespace-pre-wrap text-sm leading-relaxed">{draft.text}</pre>
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full min-h-[240px] items-center justify-center rounded-md border border-dashed border-line-strong text-sm text-faint">Pick what to write and build the brief.</div>
        )}
      </div>
    </div>
  );
}
