"use client";

// An AI answer, rendered rather than dumped. The model writes a short piece of
// prose with the odd bolded name and the odd bullet list; showing that raw
// meant reading literal asterisks, and every record it named was a dead end you
// had to go and search for again. Here the names are links into the Repo.

import Link from "next/link";
import type { ReactNode } from "react";
import type { ResultCard } from "@/lib/ai/tools";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Record names, turned into links wherever they appear in the prose. Longest
 * first so "Lonzo Ball" wins over "Ball" when both are records, and each name
 * is matched on a word boundary so it can't fire inside a longer word.
 */
function linkify(text: string, cards: ResultCard[], keyBase: string): ReactNode[] {
  const named = cards
    .filter((c) => c.name.length >= 3)
    .sort((a, b) => b.name.length - a.name.length);
  if (!named.length) return [text];

  const byName = new Map<string, ResultCard>();
  for (const c of named) if (!byName.has(c.name.toLowerCase())) byName.set(c.name.toLowerCase(), c);

  const pattern = new RegExp(`(?<![\\w'])(${named.map((c) => escape(c.name)).join("|")})(?![\\w'])`, "gi");
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = pattern.exec(text))) {
    const card = byName.get(m[1].toLowerCase());
    if (!card) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <Link
        key={`${keyBase}-l${n++}`}
        href={card.href}
        className="underline decoration-line-strong underline-offset-2 hover:text-accent hover:decoration-accent"
      >
        {m[1]}
      </Link>,
    );
    last = m.index + m[1].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** **Bold** is the only inline formatting the answer is allowed to use. */
function inline(text: string, cards: ResultCard[], keyBase: string): ReactNode[] {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={`${keyBase}-b${i}`} className="font-semibold text-charcoal">
        {linkify(part, cards, `${keyBase}-b${i}`)}
      </strong>
    ) : (
      <span key={`${keyBase}-t${i}`}>{linkify(part, cards, `${keyBase}-t${i}`)}</span>
    ),
  );
}

const BULLET = /^\s*(?:[-•*]\s+|\d+[.)]\s+)/;

export function AiAnswer({ text, cards }: { text: string; cards: ResultCard[] }) {
  const blocks = text.trim().split(/\n{2,}/);

  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-charcoal">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim());
        const bulleted = lines.length > 0 && lines.every((l) => BULLET.test(l));

        if (bulleted) {
          return (
            <ul key={bi} className="space-y-1.5">
              {lines.map((line, li) => (
                <li key={li} className="flex gap-2.5">
                  <span aria-hidden className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-accent" />
                  <span className="min-w-0">{inline(line.replace(BULLET, ""), cards, `${bi}-${li}`)}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={bi}>
            {lines.map((line, li) => (
              <span key={li}>
                {li > 0 && <br />}
                {inline(line, cards, `${bi}-${li}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
