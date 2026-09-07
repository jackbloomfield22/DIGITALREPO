"use client";

import { useState } from "react";
import { AiAnswer } from "@/components/ai-answer";

// The one model-backed feature in HQ: a question over the live brain. Shown
// only when AI is switched on in Settings; every answer shows what it cost.

export function AskBrain({ initial, capCents, spentCents }: { initial?: string; capCents: number; spentCents: number }) {
  const [q, setQ] = useState(initial ?? "");
  const [turns, setTurns] = useState<{ role: "user" | "assistant"; content: string; cents?: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spent = spentCents + turns.reduce((n, t) => n + (t.cents ?? 0), 0);

  const ask = async () => {
    const question = q.trim(); if (!question || busy) return;
    setBusy(true); setError(null);
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((t) => [...t, { role: "user", content: question }]);
    setQ("");
    const r = await fetch("/api/hq/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, history }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Could not reach the server." }));
    if (r.ok) setTurns((t) => [...t, { role: "assistant", content: r.text, cents: r.costCents }]);
    else setError(r.error ?? "That didn't work.");
    setBusy(false);
  };

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="overline">Ask the brain</div>
        <span className="text-xs text-faint">Today: ${(spent / 100).toFixed(2)}{capCents ? ` of $${(capCents / 100).toFixed(2)}` : ""}</span>
      </div>
      <div className="space-y-3">
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "text-sm font-medium" : "rounded bg-wash px-3 py-2 text-sm"}>
            {t.role === "user" ? t.content : <AiAnswer text={t.content} cards={[]} />}
            {t.cents !== undefined && <div className="mt-1 text-right text-xs text-faint">{t.cents < 1 ? "<1¢" : `${t.cents}¢`}</div>}
          </div>
        ))}
      </div>
      {error && <div className="mt-2 text-sm text-[#8a3a30]">{error}</div>}
      <div className="mt-2 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="A question only the live brain can answer — who, what, when, across everything." className="flex-1 text-sm" />
        <button className="btn btn-primary btn-sm" disabled={busy || !q.trim()} onClick={ask}>{busy ? "Thinking…" : "Ask"}</button>
      </div>
    </div>
  );
}
