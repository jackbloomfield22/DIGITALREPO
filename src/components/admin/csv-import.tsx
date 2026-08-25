"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { importCreators } from "@/lib/actions/admin";
import { normalizeTalentRows, type ParsedTalent } from "@/lib/talent-import";
import { compactNumber } from "@/lib/format";
import { useToast } from "@/components/toast";

const TEMPLATE_COLUMNS = [
  "name", "headline", "age", "based_in", "categories", "interests", "sports",
  "instagram_handle", "instagram_followers", "instagram_engagement_rate",
  "tiktok_handle", "tiktok_followers", "tiktok_engagement_rate",
  "youtube_handle", "youtube_followers", "mini_bio",
];

const TEMPLATE = `${TEMPLATE_COLUMNS.join(",")}
"Alex Rivers","Climbing filmmaker","29","Denver","YouTuber; Athlete","Photography; Sustainability","Climbing","alexrivers","120000","3.2%","alexrivers","340000","6.1%","AlexRivers","890000","Alpine climber and filmmaker."`;

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
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

function SocialSummary({ talent }: { talent: ParsedTalent }) {
  if (!talent.socials.length) return <span className="text-faint">—</span>;
  return (
    <span className="space-x-1.5">
      {talent.socials.map((s) => (
        <span key={s.platform} className="whitespace-nowrap">
          <span className="text-muted">{s.platform}</span>{" "}
          {s.followerCount != null ? compactNumber(s.followerCount) : "—"}
          {s.engagementRate != null && <span className="text-faint"> · {s.engagementRate}%</span>}
        </span>
      ))}
    </span>
  );
}

export function CsvImport() {
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; enriched: number; details: string[] } | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const parsed = useMemo(() => normalizeTalentRows(rawRows), [rawRows]);
  const unnamed = rawRows.filter((r) => normalizeTalentRows([r]).length === 0).length;

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 font-display text-3xl font-bold tracking-tight">TALENT IMPORT</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Bulk-add talent from a spreadsheet. Exports from creator tools (CreatorIQ and the like)
        work as-is — column names are matched loosely, <code>1.61M</code> and <code>646.95K</code>{" "}
        counts are understood, and engagement rates are kept. Talent already in the Repo is
        enriched, not duplicated: blank fields get filled and follower counts refresh.
        Only a name column is required.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            const blob = new Blob([TEMPLATE], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "talent-import-template.csv";
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
              setRawRows(parseCsv(await file.text()));
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {parsed.length > 0 && !result && (
        <div className="card p-4">
          <div className="mb-2 text-sm">
            <strong>{fileName}</strong> — {parsed.length} talent profiles
            {unnamed > 0 && <span className="text-warn"> · {unnamed} rows without a name (ignored)</span>}
          </div>
          <div className="max-h-80 overflow-auto rounded border border-line">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line bg-wash text-left">
                  {["name", "headline", "based in", "types", "accounts"].map((h) => (
                    <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 100).map((t, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-2 py-1 font-medium">{t.name}</td>
                    <td className="max-w-48 truncate px-2 py-1 text-muted">{t.headline ?? t.miniBio}</td>
                    <td className="px-2 py-1 text-muted">{t.basedIn}</td>
                    <td className="max-w-32 truncate px-2 py-1 text-muted">{t.categories.join(", ")}</td>
                    <td className="px-2 py-1"><SocialSummary talent={t} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await importCreators(rawRows);
                setBusy(false);
                if (res.ok) {
                  setResult({ created: res.created ?? 0, enriched: res.enriched ?? 0, details: res.details ?? [] });
                  toast(`Added ${res.created}, enriched ${res.enriched}`);
                  router.refresh();
                } else toast(res.error ?? "Import failed", { tone: "error" });
              }}
            >
              {busy ? "Importing…" : `Import ${parsed.length} Talent Profiles`}
            </button>
            <button className="btn btn-ghost" onClick={() => setRawRows([])}>Cancel</button>
          </div>
        </div>
      )}

      {result && (
        <div className="card p-4 text-sm">
          <p className="font-medium">
            Added {result.created} new talent · enriched {result.enriched} existing.
          </p>
          {result.details.length > 0 && (
            <div className="mt-2 text-muted">
              <div className="font-medium">Enriched:</div>
              <ul className="list-inside list-disc">
                {result.details.slice(0, 40).map((s, i) => (
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
