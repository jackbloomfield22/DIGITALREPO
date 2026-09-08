import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { firstParam, pageNumber, type SearchParams } from "@/lib/directory-params";
import { searchRepo, SEARCH_PAGE_SIZE } from "@/lib/repo-search";
import { Pagination } from "@/components/pagination";

export const metadata = { title: "Search the Repo" };
export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireUser();
  const params = await searchParams;
  const archived = firstParam(params.archived) === "1";
  const result = await searchRepo(firstParam(params.q) ?? "", { type: firstParam(params.type), page: pageNumber(params.page), archived });
  const href = (type = "") => { const p = new URLSearchParams({ q: result.q }); if (type) p.set("type", type); if (archived) p.set("archived", "1"); return `/search?${p}`; };
  return <div>
    <h1 className="mb-2 font-display text-3xl font-bold">Search the Repo</h1>
    <p className="mb-5 text-sm text-muted">Find names, interests, companies, descriptions, and connected records in one place.</p>
    <form action="/search" role="search" className="mb-6 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap gap-2"><input autoFocus type="search" name="q" defaultValue={result.q} key={result.q} maxLength={200} placeholder="Try basketball, Nike, or a person’s name…" aria-label="Search the Repo" className="!min-h-11 min-w-48 flex-1" /><button className="btn btn-accent">Search</button></div>
      {result.selected && <input type="hidden" name="type" value={result.selected} />}
      <label className="mt-3 flex items-center gap-2"><input type="checkbox" name="archived" value="1" defaultChecked={archived} key={String(archived)} />Include archived records</label>
    </form>
    {!result.q ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{result.groups.map((g) => <Link key={g.type} href={g.href} className="card p-4 font-medium hover:border-accent">Browse {g.label.toLowerCase()} <span aria-hidden>→</span></Link>)}</div> : <div className="grid items-start gap-6 lg:grid-cols-[13rem_1fr]">
      <nav aria-label="Filter search results by section" className="flex flex-wrap gap-1 lg:sticky lg:top-5 lg:block lg:space-y-1">
        {[{ type: "", label: "All results", count: result.total }, ...result.groups].map((g) => <Link key={g.type} href={href(g.type)} aria-current={result.selected === g.type ? "page" : undefined} className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm ${result.selected === g.type ? "bg-ink text-paper" : "bg-surface text-muted hover:bg-wash"}`}><span>{g.label}</span><span className="tabular-nums">{g.count.toLocaleString()}</span></Link>)}
      </nav>
      <div className="min-w-0">
        <p className="mb-4 text-sm text-muted" role="status">{(result.selected ? result.groups.find((g) => g.type === result.selected)?.count ?? 0 : result.total).toLocaleString()} results for <strong className="break-words text-ink">“{result.q}”</strong></p>
        {result.groups.filter((g) => g.items.length > 0).map((g) => <section key={g.type} className="mb-6">
          <div className="mb-2 flex items-center justify-between gap-2"><h2 className="font-semibold">{g.label}</h2>{!result.selected && g.count > g.items.length && <Link className="text-sm text-accent hover:underline" href={href(g.type)}>View all {g.count} →</Link>}</div>
          <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">{g.items.map((item) => <Link key={item.id} href={item.href} className="block px-4 py-3 hover:bg-wash/60">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="break-words font-semibold">{item.label}</span><span className="text-xs text-muted">{item.archived ? "Archived" : item.sub}</span></div>
            {item.detail && <p className="mt-1 line-clamp-2 break-words text-sm leading-relaxed text-muted">{item.detail}</p>}
          </Link>)}</div>
        </section>)}
        {!result.groups.some((g) => g.items.length) && <div className="rounded-lg border border-dashed border-line-strong p-6"><h2 className="mb-2 font-semibold">No matching records</h2><p className="text-sm text-muted">Try fewer words, another spelling, or include archived records.</p>{result.selected && <Link className="mt-3 inline-block text-sm text-accent underline" href={href()}>Search every section</Link>}</div>}
        {result.selected && <><Pagination page={result.page} pages={result.pages} /><p className="mt-2 text-center text-xs text-muted">Up to {SEARCH_PAGE_SIZE} results per page · Alphabetical</p></>}
      </div>
    </div>}
  </div>;
}
