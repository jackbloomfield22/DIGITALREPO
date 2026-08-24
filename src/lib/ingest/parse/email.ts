// Deterministic email parsing: postal-mime (pure JS, serverless-safe),
// conservative quote/signature/disclaimer stripping, stable thread ids.

import PostalMime, { type Email } from "postal-mime";
import crypto from "crypto";

export type ParsedEmail = {
  headers: {
    from: string;
    to: string[];
    cc: string[];
    date: string | null;
    subject: string;
    messageId: string | null;
    inReplyTo: string | null;
    references: string[];
  };
  cleanText: string;
  strippedText: string; // what the heuristics removed, kept for the model
  threadId: string;
  attachments: { filename: string; mimeType: string; content: Uint8Array }[];
};

const addr = (a?: { name?: string; address?: string } | null) =>
  a ? `${a.name ? `${a.name} ` : ""}<${a.address ?? ""}>`.trim() : "";

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const QUOTE_INTRO = /^On .{5,120}(wrote|écrit|schrieb):\s*$/;
const FORWARD_MARK = /^-{2,}\s*(Original Message|Forwarded message)\s*-{2,}/i;
const SIG_MARK = /^--\s*$/;
const DISCLAIMER_HINTS = [
  /this (e-?mail|message).{0,60}(confidential|privileged)/i,
  /if you (are not|received this).{0,60}(intended recipient|in error)/i,
  /^sent from my (iphone|ipad|android|galaxy|mobile)/i,
  /^unsubscribe\b/i,
];

/**
 * Conservative reply/signature/disclaimer stripping: only removes a suffix of
 * the message (from a recognized marker to the end), never interior content.
 */
export function stripQuoted(text: string): { clean: string; stripped: string } {
  const lines = text.split("\n");
  let cut = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (QUOTE_INTRO.test(line) || FORWARD_MARK.test(line) || SIG_MARK.test(lines[i])) {
      cut = i;
      break;
    }
    // A run of quoted lines that continues to the end
    if (line.startsWith(">")) {
      const rest = lines.slice(i);
      const quoted = rest.filter((l) => l.trim().startsWith(">") || l.trim() === "").length;
      if (quoted / rest.length > 0.8) {
        cut = i;
        break;
      }
    }
    if (DISCLAIMER_HINTS.some((re) => re.test(line))) {
      cut = i;
      break;
    }
  }

  const clean = lines.slice(0, cut).join("\n").trim();
  const stripped = lines.slice(cut).join("\n").trim();
  // Never strip the whole message
  if (!clean) return { clean: text.trim(), stripped: "" };
  return { clean, stripped };
}

export function normalizeSubject(subject: string): string {
  return subject
    .replace(/^\s*((re|fw|fwd|aw|sv)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();
}

/** Stable thread id from References/In-Reply-To, else normalized subject. */
export function computeThreadId(headers: {
  references: string[];
  inReplyTo: string | null;
  messageId: string | null;
  subject: string;
}): string {
  const root =
    headers.references[0] ??
    headers.inReplyTo ??
    (normalizeSubject(headers.subject)
      ? `subject:${normalizeSubject(headers.subject)}`
      : headers.messageId ?? crypto.randomUUID());
  return crypto.createHash("sha1").update(root).digest("hex").slice(0, 16);
}

export async function parseEml(bytes: Uint8Array): Promise<ParsedEmail> {
  const email: Email = await PostalMime.parse(bytes);

  const references = (email.references ?? "")
    .split(/\s+/)
    .map((r) => r.trim())
    .filter(Boolean);
  const headers = {
    from: addr(email.from),
    to: (email.to ?? []).map(addr).filter(Boolean),
    cc: (email.cc ?? []).map(addr).filter(Boolean),
    date: email.date ?? null,
    subject: email.subject ?? "(no subject)",
    messageId: email.messageId ?? null,
    inReplyTo: email.inReplyTo ?? null,
    references,
  };

  const body = email.text?.trim() || (email.html ? htmlToText(email.html) : "");
  const { clean, stripped } = stripQuoted(body);

  return {
    headers,
    cleanText: clean,
    strippedText: stripped,
    threadId: computeThreadId(headers),
    attachments: (email.attachments ?? [])
      .filter((a) => a.content && !a.related) // skip inline images
      .map((a) => ({
        filename: a.filename || "attachment",
        mimeType: a.mimeType || "application/octet-stream",
        content:
          typeof a.content === "string"
            ? new TextEncoder().encode(a.content)
            : new Uint8Array(a.content),
      })),
  };
}
