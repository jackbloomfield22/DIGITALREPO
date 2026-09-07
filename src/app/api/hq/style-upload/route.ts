import { NextResponse } from "next/server";
import { ownerOrNull } from "@/lib/hq/owner";
import { extractDocx, extractPdf, extractPptx } from "@/lib/ingest/parse/documents";

export const maxDuration = 60;

// A deck or a document dropped into the Studio becomes text for the examples
// library. Same extractors as ingest; nothing is stored here — the text goes
// back to the page for the owner to title and save.
export async function POST(request: Request) {
  const user = await ownerOrNull();
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > 40 * 1024 * 1024) return NextResponse.json({ error: "Keep examples under 40MB." }, { status: 400 });
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const out = ext === "pdf" ? await extractPdf(bytes)
      : ext === "docx" ? extractDocx(bytes)
      : ext === "pptx" ? extractPptx(bytes)
      : ["txt", "md", "eml", "html", "htm"].includes(ext) ? { text: new TextDecoder().decode(bytes), truncated: false }
      : null;
    if (!out) return NextResponse.json({ error: `Can't read .${ext} — use PDF, DOCX, PPTX or text.` }, { status: 400 });
    return NextResponse.json({ title: file.name.replace(/\.[^.]+$/, ""), text: out.text.slice(0, 200_000), truncated: out.truncated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read that file." }, { status: 422 });
  }
}
