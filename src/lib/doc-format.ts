// Turning documents into something safe to render, and uploaded files into
// something worth editing. Pure text in, pure text out — no database, no
// request — so both halves can be exercised directly against a real slate.
//
// Sanitizing matters because the editor stores HTML and the page renders it, so
// anything that survives a save runs in the next reader's browser. Only editors
// can write and everyone here is internal, but "our users are trustworthy" is
// not a security model: a block pasted from a web page carries whatever that
// page had in it.
//
// The import matters because a PDF has no structure, only text at coordinates.
// Headings, paragraphs and wrapped lines all come back as one stream, so
// rebuilding a document from it is guesswork — and the rules below are written
// to fail towards plain paragraphs rather than towards confident nonsense.

// ---------------------------------------------------------------------------
// Sanitizing
// ---------------------------------------------------------------------------

const ALLOWED_TAGS = new Set([
  "p", "br", "div", "span",
  "h1", "h2", "h3", "h4",
  "strong", "b", "em", "i", "u", "s", "strike",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "a", "hr",
  "table", "thead", "tbody", "tr", "th", "td",
]);

/** Only what formatting needs; nothing that can carry behaviour. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
};

/**
 * Strip everything that could execute. Tag-by-tag rather than regex-on-the-
 * whole-string: the dangerous cases are the ones a single clever regex misses.
 */
export function sanitizeDocHtml(html: string): string {
  let out = html;

  // Elements whose *content* is as dangerous as the tag, so drop both.
  out = out.replace(/<(script|style|iframe|object|embed|form|noscript)\b[\s\S]*?<\/\1\s*>/gi, "");
  // …and their unclosed forms.
  out = out.replace(/<\/?(script|style|iframe|object|embed|form|noscript)\b[^>]*>/gi, "");

  out = out.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g, (match, close: string, rawName: string, rawAttrs: string) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";
    if (close) return `</${name}>`;

    const allowed = ALLOWED_ATTRS[name];
    if (!allowed) return `<${name}>`;

    const kept: string[] = [];
    const attrPattern = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let attr: RegExpExecArray | null;
    while ((attr = attrPattern.exec(rawAttrs))) {
      const key = attr[1].toLowerCase();
      const value = attr[2] ?? attr[3] ?? attr[4] ?? "";
      if (!allowed.has(key)) continue;
      // javascript:, data:, vbscript: — anything that isn't plainly a location.
      if (key === "href" && !/^(https?:\/\/|mailto:|\/|#)/i.test(value.trim())) continue;
      kept.push(`${key}="${value.replace(/"/g, "&quot;")}"`);
    }
    return kept.length ? `<${name} ${kept.join(" ")}>` : `<${name}>`;
  });

  return out;
}

// ---------------------------------------------------------------------------
// Turning an uploaded slate back into a document
// ---------------------------------------------------------------------------

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Lines the slate uses as labels, which read better in bold than as prose. */
const LABEL = /^(P|S|D|EP|EPS|DP|W|BRAND OPPORTUNITY|BRAND|STATUS|BUYER|LAST UPDATED|LOGLINE|NOTE|NOTES)\s*:/i;

/** A heading is shouted; a line with a colon is a label, however shouty. */
function isHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 90) return false;
  if (LABEL.test(t)) return false;
  if (!/[A-Z]{3}/.test(t)) return false;
  return t === t.toUpperCase();
}

/**
 * PDF text arrives hard-wrapped at whatever width the page was, so a sentence
 * is four "lines" and a company list breaks mid-list. Rejoining is a judgement
 * call every time; these are the cases that are safe to call.
 */
function unwrap(lines: string[]): string[] {
  const out: string[] = [];
  // The previous *physical* line, before any joining. Judging "was this
  // wrapped?" on the joined paragraph instead would be self-fulfilling: one
  // join makes it long, which justifies the next, and a whole section ends up
  // as a single paragraph.
  let previousRaw = "";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      out.push("");
      previousRaw = "";
      continue;
    }
    const prev = out.length ? out[out.length - 1] : "";
    const join = () => {
      out[out.length - 1] = `${prev} ${line}`;
      previousRaw = line;
    };

    // A line left hanging on a comma is a continuation whatever it looks like.
    // This is checked before anything else because the case it exists for is a
    // list of production companies wrapping onto a line that happens to be all
    // capitals — "JAKM3N" is the rest of a credit, not a new heading.
    if (prev && !LABEL.test(line) && /[,;&/]$/.test(previousRaw)) {
      join();
      continue;
    }

    if (!prev || isHeading(line) || isHeading(prev) || LABEL.test(line)) {
      out.push(line);
      previousRaw = line;
      continue;
    }
    // Otherwise, length is what separates a paragraph the page wrapped from a
    // short entry someone meant to end there: a line that ran to the edge was
    // almost certainly cut mid-sentence, a line of four words was not.
    const wasWrapped = previousRaw.length >= 55 && !/[.!?:)…]$/.test(previousRaw);
    const continuesSentence = /^[a-z(,;)]/.test(line);
    if (wasWrapped || continuesSentence) {
      join();
      continue;
    }
    out.push(line);
    previousRaw = line;
  }
  return out;
}

/**
 * Words that name a part of a document rather than a thing in it. Generic on
 * purpose: a slate reorganised next quarter should still come out structured,
 * which a hard-coded list of this quarter's section names would not manage.
 */
const SECTION_WORDS = /\b(LIST|TRACKING|PRODUCTION|DEVELOPMENT|ARCHIVE|PROJECTS|COMPLETED|SCRIPTED|HOLD|BRANDED|OVERVIEW|SUMMARY|APPENDIX)\b/;

/**
 * A section heading is one that introduces other headings — "PROJECTS IN
 * PRODUCTION" before "ROOKIE DINNER" — or one that names a part of the
 * document outright. Everything else is the title of an entry inside a
 * section, which is the overwhelming majority.
 */
function headingLevel(lines: string[], index: number): 2 | 3 {
  const self = lines[index].trim();
  if (self.split(/\s+/).length <= 5 && SECTION_WORDS.test(self)) return 2;
  for (let i = index + 1; i < Math.min(lines.length, index + 4); i++) {
    const next = lines[i]?.trim();
    if (!next) continue;
    return isHeading(next) ? 2 : 3;
  }
  return 3;
}

/** Text extracted from an uploaded document, as editable formatted HTML. */
export function textToDocHtml(text: string): string {
  const lines = unwrap(text.replace(/\r\n?/g, "\n").split("\n"));
  const html: string[] = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
  };

  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t) {
      closeList();
      return;
    }

    if (isHeading(t)) {
      closeList();
      const level = headingLevel(lines, i);
      html.push(`<h${level}>${escape(t)}</h${level}>`);
      return;
    }

    const label = LABEL.exec(t);
    if (label) {
      closeList();
      const rest = t.slice(label[0].length).trim();
      html.push(`<p><strong>${escape(label[0].replace(/:$/, ""))}:</strong> ${escape(rest)}</p>`);
      return;
    }

    // Bullets the PDF drew as characters, and short lines under a heading that
    // are plainly a list rather than prose.
    const bullet = /^[•●○▪·*-]\s+/.exec(t);
    if (bullet) {
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${escape(t.slice(bullet[0].length))}</li>`);
      return;
    }

    closeList();
    html.push(`<p>${escape(t)}</p>`);
  });

  closeList();
  return html.join("\n");
}
