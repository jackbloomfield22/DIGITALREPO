"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { importCreators, type ImportRow } from "@/lib/actions/admin";
import { useToast } from "@/components/toast";

const TEMPLATE_COLUMNS = [
  "name", "headline", "age", "based_in", "categories", "interests", "sports",
  "instagram_handle", "instagram_followers", "tiktok_handle", "tiktok_followers",
  "youtube_handle", "youtube_followers", "mini_bio",
];

const TEMPLATE = `${TEMPLATE_COLUMNS.join(",")}
"Alex Rivers","Climbing filmmaker","29","Denver","YouTuber; Athlete","Photography; Sustainability","Climbing","alexrivers","120000","alexrivers","340000","AlexRivers","890000","Alpine climber and filmmaker."`;

/** Minimal CSV parser with quoted-field support. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c !== "")) rows.push(row);
  if (rows.length < 1) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

export function CsvImport() {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: string[] } | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const valid = rows.filter((r) => r.name?.trim());
  const invalid = rows.length - valid.length;

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 font-display text-3xl font-bold tracking-tight">CSV IMPORT</h1>
      <p className="mb-6 text-sm text-muted">
        Bulk-import creators. Only <code>name</code> is required; multi-value columns
        (categories, interests, sports) use <code>;</code> separators. Duplicate names are
        skipped automatically.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            const blob = new Blob([TEMPLATE], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "creator-import-template.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download Template
        </button>
        <label className="btn btn-primary btn-sm cursor-pointer">
          Choose CSV…
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setFileName(file.name);
              setResult(null);
              setRows(parseCsv(await file.text()));
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {rows.length > 0 && !result && (
        <div className="card p-4">
          <div className="mb-2 text-sm">
            <strong>{fileName}</strong> — {valid.length} importable rows
            {invalid > 0 && <span className="text-warn"> · {invalid} rows missing a name (skipped)</span>}
          </div>
          <div className="max-h-72 overflow-auto rounded border border-line">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line bg-wash text-left">
                  {["name", "headline", "based_in", "categories", "interests", "sports"].map((h) => (
                    <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {valid.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-2 py-1">{r.name}</td>
                    <td className="max-w-40 truncate px-2 py-1 text-muted">{r.headline}</td>
                    <td className="px-2 py-1 text-muted">{r.based_in}</td>
                    <td className="max-w-32 truncate px-2 py-1 text-muted">{r.categories}</td>
                    <td className="max-w-32 truncate px-2 py-1 text-muted">{r.interests}</td>
                    <td className="max-w-24 truncate px-2 py-1 text-muted">{r.sports}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              className="btn btn-primary"
              disabled={busy || valid.length === 0}
              onClick={async () => {
                setBusy(true);
                const res = await importCreators(valid as ImportRow[]);
                setBusy(false);
                if (res.ok) {
                  setResult({ imported: res.imported ?? 0, skipped: res.skipped ?? [] });
                  toast(`Imported ${res.imported} creators`);
                  router.refresh();
                } else toast(res.error ?? "Import failed", { tone: "error" });
              }}
            >
              {busy ? "Importing…" : `Import ${valid.length} Creators`}
            </button>
            <button className="btn btn-ghost" onClick={() => setRows([])}>Cancel</button>
          </div>
        </div>
      )}

      {result && (
        <div className="card p-4 text-sm">
          <p className="font-medium">Imported {result.imported} creators.</p>
          {result.skipped.length > 0 && (
            <div className="mt-2 text-muted">
              <div className="font-medium">Skipped:</div>
              <ul className="list-inside list-disc">
                {result.skipped.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
