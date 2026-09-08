/** URL values are untrusted input, including repeated and non-finite numbers. */
export type SearchParams = Record<string, string | string[] | undefined>;
export const firstParam = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
export function pageNumber(value: string | string[] | undefined): number {
  const n = Number(firstParam(value));
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 100_000) : 1;
}
export function nonNegativeNumber(value: string | string[] | undefined): number | undefined {
  const raw = firstParam(value);
  if (!raw?.trim()) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 2_147_483_647 ? Math.floor(n) : undefined;
}
export function clearDirectoryFilters(params: URLSearchParams) {
  for (const key of [...params.keys()]) if (key !== 'sort' && key !== 'view') params.delete(key);
}
export function removeFilterValue(params: URLSearchParams, key: string, value: string) {
  const remaining = params.getAll(key).filter((v) => v !== value);
  params.delete(key);
  remaining.forEach((v) => params.append(key, v));
}

export function directoryPageUrl(path: string, params: SearchParams, page: number): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && key !== "page") (Array.isArray(value) ? value : [value]).forEach((v) => query.append(key, v));
  }
  if (page > 1) query.set("page", String(page));
  return `${path}${query.size ? `?${query}` : ""}`;
}
