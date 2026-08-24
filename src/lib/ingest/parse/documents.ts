// Deterministic document text extraction. One tiny dependency (fflate) covers
// zip/docx/pptx/xlsx — all zip-of-XML formats where we want text, not layout;
// unpdf (pdf.js packaged for serverless) covers PDF.

import { unzipSync, type Unzipped } from "fflate";

export const TEXT_CAP = Number(process.env.INGEST_TEXT_CAP) > 0 ? Number(process.env.INGEST_TEXT_CAP) : 200_000;

export type Extracted = { text: string; truncated: boolean; meta?: Record<string, unknown> };

const cap = (text: string): Extracted => ({
  text: text.length > TEXT_CAP ? text.slice(0, TEXT_CAP) : text,
  truncated: text.length > TEXT_CAP,
});

const decodeXmlEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

/** Pull the text runs matching `tag` (e.g. w:t, a:t) out of raw XML. */
function xmlRuns(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(decodeXmlEntities(m[1]));
  return out;
}

const utf8 = new TextDecoder();

export async function extractPdf(bytes: Uint8Array): Promise<Extracted> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const result = cap(typeof text === "string" ? text : (text as string[]).join("\n"));
  return { ...result, meta: { pageCount: totalPages } };
}

export function extractDocx(bytes: Uint8Array): Extracted {
  const files = unzipSync(bytes);
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("Not a valid .docx (missing word/document.xml)");
  const xml = utf8.decode(doc);
  // Paragraph boundaries become newlines; then join text runs inside each.
  const paragraphs = xml.split(/<\/w:p>/).map((p) => xmlRuns(p, "w:t").join("")).filter(Boolean);
  return cap(paragraphs.join("\n"));
}

export function extractPptx(bytes: Uint8Array): Extracted {
  const files = unzipSync(bytes);
  const slides = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const chunks = slides.map((name, i) => {
    const runs = xmlRuns(utf8.decode(files[name]), "a:t");
    return `— Slide ${i + 1} —\n${runs.join("\n")}`;
  });
  const result = cap(chunks.join("\n\n"));
  return { ...result, meta: { slideCount: slides.length } };
}

export function extractXlsx(bytes: Uint8Array): Extracted {
  const files = unzipSync(bytes);
  const shared = files["xl/sharedStrings.xml"]
    ? xmlRuns(utf8.decode(files["xl/sharedStrings.xml"]), "t")
    : [];
  const sheets = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort();
  const lines: string[] = [];
  for (const name of sheets) {
    const xml = utf8.decode(files[name]);
    lines.push(`— Sheet ${name.match(/sheet(\d+)/)?.[1] ?? ""} —`);
    for (const rowXml of xml.split(/<\/row>/)) {
      const cells: string[] = [];
      const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
      let m: RegExpExecArray | null;
      while ((m = cellRe.exec(rowXml))) {
        const t = m[1].match(/\bt="([^"]+)"/)?.[1];
        const inner = m[2];
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? xmlRuns(inner, "t").join("");
        if (v === undefined || v === "") continue;
        cells.push(t === "s" ? (shared[Number(v)] ?? "") : decodeXmlEntities(v));
      }
      if (cells.length) lines.push(cells.join("\t"));
    }
  }
  return cap(lines.join("\n"));
}

export function unzipChildren(bytes: Uint8Array, maxChildren: number, maxTotalBytes: number): {
  name: string;
  content: Uint8Array;
}[] {
  let files: Unzipped;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("Could not read zip archive.");
  }
  const entries = Object.entries(files).filter(
    ([name, content]) =>
      content.byteLength > 0 &&
      !name.endsWith("/") &&
      !name.startsWith("__MACOSX/") &&
      !/(^|\/)\./.test(name),
  );
  if (entries.length > maxChildren) {
    throw new Error(`Archive has ${entries.length} files — the limit is ${maxChildren}. Split it up.`);
  }
  const total = entries.reduce((n, [, c]) => n + c.byteLength, 0);
  if (total > maxTotalBytes) {
    throw new Error(`Archive unpacks to ${(total / 1024 / 1024).toFixed(1)}MB — the limit is ${(maxTotalBytes / 1024 / 1024).toFixed(0)}MB.`);
  }
  return entries.map(([name, content]) => ({ name, content }));
}
