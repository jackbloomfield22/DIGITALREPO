import Link from "next/link";
import { requireUser, hasRole } from "@/lib/auth";
import { firstParam, pageNumber, type SearchParams } from "@/lib/directory-params";
import { searchRepo, SEARCH_PAGE_SIZE, SEARCH_SECTIONS } from "@/lib/repo-search";
import { Pagination } from "@/components/pagination";
import { typeLabel } from "@/lib/record-types";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Search the Repo" };

const UPDATED = [{ value: "", label: "Any time" }, { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }];

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const params = await searchParams;
  const archived = firstParam(params.archived) === "1";
  const updated = Number(firstParam(params.updated)) || 0;
  const result = await searchRepo(firstParam(params.q) ?? "", { type: firstParam(params.type), page: pageNumber(params.page), archived, updatedWithinDays: updated || undefined });
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams({ q: result.q });
    if (result.selected) p.set("type", result.selected);
    if (archived) p.set("archived", "1");
    if (updated) p.set("updated", String(updated));
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === "") p.delete(k); else p.set(k, v); }
    return `/search?${p}`;
  };
  const canEdit = hasRole(user, "EDITOR");
  const anyResults = result.groups.some((g) => g.items.length);
  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-bold">Search the Repo</h1>
      <p className="mb-4 text-sm text-muted">Names, nicknames and misspellings all find the record. Enter searches what you typed.</p>
      <form action="/search" role="search" className="mb-6 rounded-lg border border-line bg-surface p-3">
        <div className="flex flex-wrap gap-2">
          <input autoFocus type="search" name="q" defaultValue={result.q} key={result.q} maxLength={200} placeholder="Try a name, a sport, a brand, a title…" aria-label="Search the Repo" className="!min-h-11 min-w-48 flex-1" />
          <button className="btn btn-accent min-h-11">Search</button>
        </div>
        {result.selected && <input type="hidden" name="type" value={result.selected} />}
        {updated ? <input type="hidden" name="updated" value={updated} /> : null}
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" name="archived" value="1" defaultChecked={archived} key={String(archived)} className="!w-auto" />Show archived records</label>
      </form>

      {!result.q ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{SEARCH_SECTIONS.map((g) => <Link key={g.type} href={g.href} className="card p-4 font-medium hover:border-accent">Browse {g.label.toLowerCase()} <span aria-hidden>→</span></Link>)}</div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[14rem_1fr]">
          <aside className="space-y-5 lg:sticky lg:top-5">
            <nav aria-label="Filter by type" className="space-y-1">
              <div className="overline mb-1">Type</div>
              {[{ type: "", label: "All results", count: result.total }, ...result.groups].map((g) => <Link key={g.type} href={href({ type: g.type || null, page: null })} aria-current={result.selected === g.type ? "page" : undefined} className={`flex items-center justify-between gap-3 rounded-md px-3 py-1.5 text-sm ${result.selected === g.type ? "bg-ink text-paper" : "text-muted hover:bg-wash"}`}><span>{g.label}</span><span className="tabular-nums">{g.count.toLocaleString()}</span></Link>)}
            </nav>
            <nav aria-label="Filter by last updated" className="space-y-1">
              <div className="overline mb-1">Last updated</div>
              {UPDATED.map((u) => <Link key={u.value} href={href({ updated: u.value || null, page: null })} aria-current={String(updated || "") === u.value ? "page" : undefined} className={`block rounded-md px-3 py-1.5 text-sm ${String(updated || "") === u.value ? "bg-ink text-paper" : "text-muted hover:bg-wash"}`}>{u.label}</Link>)}
            </nav>
          </aside>
          <div className="min-w-0">
            <p className="mb-4 text-sm text-muted" role="status">{(result.selected ? result.groups.find((g) => g.type === result.selected)?.count ?? 0 : result.total).toLocaleString()} results for <strong className="break-words text-ink">“{result.q}”</strong>{result.suggestion && <> · Did you mean <Link className="text-accent underline" href={`/search?q=${encodeURIComponent(result.suggestion)}`}>{result.suggestion}</Link>?</>}</p>
            {result.groups.filter((g) => g.items.length > 0).map((g) => (
              <section key={g.type} className="mb-6">
                <div className="mb-2 flex items-center justify-between gap-2"><h2 className="font-semibold">{g.label}</h2>{!result.selected && g.count > g.items.length && <Link className="text-sm text-accent hover:underline" href={href({ type: g.type, page: null })}>View all {g.count} →</Link>}</div>
                <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">{g.items.map((item) => (
                  <Link key={item.id} href={item.href} className="block px-4 py-3 hover:bg-wash/60">
                    <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="flex items-baseline gap-2"><span className="w-16 shrink-0 text-[11px] uppercase tracking-wide text-faint">{typeLabel(item.type)}</span><span className="break-words font-semibold">{item.label}</span></span><span className="text-xs text-muted">{item.archived ? "Archived" : item.sub}{item.updatedAt ? ` · ${relativeTime(item.updatedAt)}` : ""}</span></div>
                    {item.detail && <p className="mt-1 line-clamp-2 break-words pl-[4.5rem] text-sm leading-relaxed text-muted">{item.detail}</p>}
                  </Link>
                ))}</div>
              </section>
            ))}
            {!anyResults && (
              <div className="rounded-lg border border-dashed border-line-strong p-6">
                <h2 className="mb-1 font-semibold">Nothing matches “{result.q}”</h2>
                <p className="text-sm text-muted">{result.suggestion ? <>Did you mean <Link className="text-accent underline" href={`/search?q=${encodeURIComponent(result.suggestion)}`}>{result.suggestion}</Link>? Otherwise try </> : "Try "}fewer words, another spelling, or {archived ? "a different type" : <Link className="text-accent underline" href={href({ archived: "1" })}>include archived records</Link>}.</p>
                {result.selected && <Link className="mt-3 inline-block text-sm text-accent underline" href={href({ type: null })}>Search every section</Link>}
                {canEdit && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {SEARCH_SECTIONS.filter((s) => s.create && (!result.selected || result.selected === s.type)).map((s) => <Link key={s.type} href={`${s.create}?name=${encodeURIComponent(result.q)}`} className="btn btn-secondary btn-sm">Create {typeLabel(s.type).toLowerCase()} named “{result.q}”</Link>)}
                  </div>
                )}
              </div>
            )}
            {result.selected && <><Pagination page={result.page} pages={result.pages} /><p className="mt-2 text-center text-xs text-muted">Up to {SEARCH_PAGE_SIZE} results per page · best match first</p></>}
          </div>
        </div>
      )}
    </div>
  );
}
