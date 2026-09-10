// A thin client for the Airtable REST API: the token, the base rate limit
// (five requests a second per base, with a thirty-second penalty box when it
// is crossed), and the handful of calls the mirror needs. Nothing here knows
// what a format is.

import "server-only";
import { airtableToken } from "@/lib/airtable/config";

const API = "https://api.airtable.com/v0";
const CONTENT = "https://content.airtable.com/v0";
/** Airtable's ceiling for a direct upload; bigger files go in by URL. */
export const DIRECT_UPLOAD_LIMIT = 5 * 1024 * 1024;

export class AirtableError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type AirtableField = { id: string; name: string; type: string };
export type AirtableTable = { id: string; name: string; primaryFieldId: string; fields: AirtableField[] };
export type AirtableAttachment = { id: string; url?: string; filename?: string; size?: number; type?: string };
export type AirtableRecord = { id: string; createdTime?: string; fields: Record<string, unknown> };

// Requests are spaced out rather than fired together: the limit is per base,
// and a sync touching thirty records would otherwise trip it at once.
let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;
const GAP_MS = Number(process.env.AIRTABLE_MIN_GAP_MS ?? 210);

function serialised<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastAt + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
    return fn();
  });
  chain = run.catch(() => undefined);
  return run;
}

async function call<T>(method: string, url: string, body?: unknown, attempt = 0): Promise<T> {
  const token = airtableToken();
  if (!token) throw new AirtableError(401, "No Airtable token is set (AIRTABLE_TOKEN).");
  const res = await serialised(() => fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  if (res.status === 429 && attempt < 2) {
    // Airtable asks for a thirty-second pause after a burst; give it that.
    await new Promise((r) => setTimeout(r, 31_000));
    return call<T>(method, url, body, attempt + 1);
  }
  if (res.status >= 500 && attempt < 1) {
    await new Promise((r) => setTimeout(r, 2_000));
    return call<T>(method, url, body, attempt + 1);
  }
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      const j = JSON.parse(text) as { error?: { type?: string; message?: string } | string };
      message = typeof j.error === "string" ? j.error : j.error?.message ?? j.error?.type ?? text;
    } catch { /* not JSON */ }
    throw new AirtableError(res.status, message || `Airtable returned ${res.status}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

const enc = encodeURIComponent;

export const airtable = {
  listTables: (baseId: string) =>
    call<{ tables: AirtableTable[] }>("GET", `${API}/meta/bases/${enc(baseId)}/tables`).then((r) => r.tables),

  createTable: (baseId: string, name: string, fields: { name: string; type: string; options?: unknown }[]) =>
    call<AirtableTable>("POST", `${API}/meta/bases/${enc(baseId)}/tables`, { name, fields }),

  createField: (baseId: string, tableId: string, field: { name: string; type: string; options?: unknown }) =>
    call<AirtableField>("POST", `${API}/meta/bases/${enc(baseId)}/tables/${enc(tableId)}/fields`, field),

  findByFormula: (baseId: string, table: string, formula: string) =>
    call<{ records: AirtableRecord[] }>("GET", `${API}/${enc(baseId)}/${enc(table)}?filterByFormula=${enc(formula)}&maxRecords=3`).then((r) => r.records),

  getRecord: (baseId: string, table: string, recordId: string) =>
    call<AirtableRecord>("GET", `${API}/${enc(baseId)}/${enc(table)}/${enc(recordId)}`),

  createRecord: (baseId: string, table: string, fields: Record<string, unknown>) =>
    call<AirtableRecord>("POST", `${API}/${enc(baseId)}/${enc(table)}`, { fields, typecast: true }),

  updateRecord: (baseId: string, table: string, recordId: string, fields: Record<string, unknown>) =>
    call<AirtableRecord>("PATCH", `${API}/${enc(baseId)}/${enc(table)}/${enc(recordId)}`, { fields, typecast: true }),

  /** Direct upload, for files up to five megabytes. */
  uploadAttachment: (baseId: string, recordId: string, field: string, file: { contentType: string; filename: string; bytes: Uint8Array }) =>
    call<{ id: string; fields: Record<string, AirtableAttachment[]> }>(
      "POST",
      `${CONTENT}/${enc(baseId)}/${enc(recordId)}/${enc(field)}/uploadAttachment`,
      { contentType: file.contentType, filename: file.filename, file: Buffer.from(file.bytes).toString("base64") },
    ),
};

/** A formula that finds the row carrying one Repo ID. Quotes in the id are impossible (cuids), but escape anyway. */
export function repoIdFormula(fieldName: string, repoId: string): string {
  return `{${fieldName}} = "${repoId.replace(/"/g, '\\"')}"`;
}
