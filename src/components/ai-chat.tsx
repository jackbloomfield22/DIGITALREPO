"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ResultCard } from "@/lib/ai/tools";

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  cards: ResultCard[];
};

const EXAMPLES = [
  "Which creators are interested in soccer?",
  "Who has worked with Ironbark Pictures?",
  "Which athletes have hosting experience?",
  "Find LA creators who have hosted competition shows.",
  "Which creators are represented by the same agents?",
  "Find entrepreneurship creators who haven't been attached to a format yet.",
];

const TYPE_LABEL: Record<string, string> = {
  creator: "Creator",
  project: "Project",
  organization: "Organization",
  format: "Format",
  person: "Person",
  opportunity: "Opportunity",
  entity: "Entity",
};

export function AiChat({
  available,
  threads,
  initialThreadId,
  initialMessages,
}: {
  available: boolean;
  threads: { id: string; title: string }[];
  initialThreadId: string | null;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: message, cards: [] }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message }),
      });
      const body = await res.json();
      if (res.ok) {
        setThreadId(body.threadId);
        setMessages((m) => [...m, { role: "assistant", text: body.text, cards: body.cards ?? [] }]);
        window.history.replaceState(null, "", `/ai?thread=${body.threadId}`);
      } else {
        setMessages((m) => [...m, { role: "assistant", text: body.error ?? "Something went wrong.", cards: [] }]);
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Network error — try again.", cards: [] }]);
    }
    setBusy(false);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
      <aside className="hidden lg:block">
        <div className="overline mb-2">Conversations</div>
        <a href="/ai" className="btn btn-secondary btn-sm mb-3 w-full">+ New Conversation</a>
        <nav className="space-y-0.5">
          {threads.map((t) => (
            <a
              key={t.id}
              href={`/ai?thread=${t.id}`}
              className={`block truncate rounded px-2 py-1.5 text-sm ${
                t.id === threadId ? "bg-wash font-medium" : "text-muted hover:bg-wash"
              }`}
            >
              {t.title}
            </a>
          ))}
          {threads.length === 0 && <p className="px-2 text-xs text-faint">No conversations yet.</p>}
        </nav>
      </aside>

      <div className="flex min-h-[70vh] flex-col">
        <h1 className="mb-1 font-display text-3xl font-bold tracking-tight">AI SEARCH</h1>
        <p className="mb-6 text-sm text-muted">
          Ask the Digital Bible anything — answers come from the database itself, with links back
          into it.
          {!available && (
            <span className="ml-1 rounded bg-[#f5efdd] px-1.5 py-0.5 text-xs font-medium text-warn">
              AI key not configured — falling back to keyword search
            </span>
          )}
        </p>

        <div className="flex-1 space-y-5">
          {messages.length === 0 && (
            <div>
              <div className="overline mb-2">Try asking</div>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button key={ex} className="chip" onClick={() => send(ex)}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              {m.role === "user" ? (
                <div className="max-w-xl rounded-lg bg-ink px-4 py-2.5 text-sm text-paper">
                  {m.text}
                </div>
              ) : (
                <div className="max-w-2xl">
                  <div className="whitespace-pre-line text-[15px] leading-relaxed">{m.text}</div>
                  {m.cards.length > 0 && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {m.cards.map((c) => (
                        <Link
                          key={`${c.type}-${c.id}`}
                          href={c.href}
                          className="card flex items-baseline justify-between gap-2 px-3 py-2 text-sm transition-shadow hover:shadow-pop"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{c.name}</span>
                            {c.sub && <span className="block truncate text-xs text-muted">{c.sub}</span>}
                          </span>
                          <span className="kind-badge kind-project shrink-0">
                            {TYPE_LABEL[c.type] ?? c.type}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
              Searching the Digital Bible…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="sticky bottom-4 mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            type="text"
            placeholder="Ask the Digital Bible anything…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Ask the Digital Bible"
            className="shadow-card"
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
