export function HomeSearch() {
  return <form action="/search" role="search" className="flex max-w-3xl flex-wrap gap-2 rounded-lg border border-line bg-surface p-2 shadow-card"><input type="search" name="q" maxLength={200} placeholder="Search names, interests, brands, projects…" aria-label="Search the Repo" className="!min-h-11 min-w-48 flex-1 !border-0" /><button className="btn btn-accent">Search the Repo</button></form>;
}
