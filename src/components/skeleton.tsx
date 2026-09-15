// Placeholders that match the layout they stand in for, so nothing moves when
// the real thing arrives. They fade in after 200 ms (see .skeleton) so a fast
// page never flashes grey.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

/** A directory page: title, controls bar, then rows at the regular density. */
export function ListSkeleton({ rows = 12 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-4 flex items-center gap-3"><Skeleton className="h-7 w-40" /><Skeleton className="h-6 w-20 rounded-full" /></div>
      <Skeleton className="mb-4 h-[62px] w-full rounded-lg" />
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="h-9 border-b border-line bg-wash" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line px-3 py-2.5 last:border-0">
            <Skeleton className="h-4 w-1/4" /><Skeleton className="h-4 w-1/6" /><Skeleton className="h-4 w-1/5" /><Skeleton className="h-4 w-1/6" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A record page: header, details column, tabs and a few blocks. */
export function RecordSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-6">
        <Skeleton className="mb-2 h-3 w-16" />
        <Skeleton className="mb-3 h-8 w-72" />
        <div className="flex gap-2"><Skeleton className="h-7 w-24" /><Skeleton className="h-7 w-8" /><Skeleton className="h-7 w-20" /><Skeleton className="h-7 w-14" /></div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[300px_1.25rem_minmax(0,1fr)]">
        <Skeleton className="h-40 w-full rounded-lg" />
        <div className="hidden lg:block" />
        <div>
          <div className="mb-5 flex gap-4 border-b border-line pb-2"><Skeleton className="h-5 w-16" /><Skeleton className="h-5 w-14" /><Skeleton className="h-5 w-16" /><Skeleton className="h-5 w-14" /></div>
          <Skeleton className="mb-6 h-24 w-full rounded-md" />
          <Skeleton className="mb-2 h-3 w-24" /><Skeleton className="mb-6 h-16 w-full" />
          <Skeleton className="mb-2 h-3 w-24" /><Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}
