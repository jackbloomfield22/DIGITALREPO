import Link from "next/link";
import { requireUser, hasRole } from "@/lib/auth";
import { listSubmissions } from "@/lib/uploads";
import { SubmissionList } from "@/components/uploads/submission-list";

export const metadata = { title: "Add Information" };

// One front door for every way information gets into the Repo. Each route is
// described by what it's for rather than by the machinery behind it, and the
// history below shows everything submitted — with a way to take any of it back.

export default async function UploadsPage() {
  const user = await requireUser();
  const canEdit = hasRole(user, "EDITOR");
  const isAdmin = hasRole(user, "ADMIN");
  const submissions = await listSubmissions();

  const routes = [
    {
      href: "/ingest",
      title: "Paste or drop something in",
      body: "An email thread, meeting notes, a deck, a PDF. It gets read, and you get a list of suggested changes to approve or reject before anything lands.",
      cta: "Go to Ingest",
      show: canEdit,
    },
    {
      href: "/admin/import",
      title: "A spreadsheet of talent",
      body: "A CSV from a creator platform or your own list. Follower counts and engagement rates come along, and anyone already in the Repo is filled in rather than duplicated.",
      cta: "Talent Import",
      show: isAdmin,
    },
    {
      href: "/admin/bulk-upload",
      title: "A prepared knowledge bundle",
      body: "A .json file covering many records at once — organizations, people, talent, projects, formats, opportunities. Shows you what's inside before it writes anything.",
      cta: "Bulk Upload",
      show: isAdmin,
    },
  ].filter((r) => r.show);

  const needsReview = submissions.filter((s) => s.state === "needs-review").length;

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 font-display text-3xl font-bold tracking-tight">ADD INFORMATION</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Three ways in, depending on what you have. Everything you submit is listed below with
        what it did, and anything can be taken back out — so it is always safe to try.
      </p>

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        {routes.map((r) => (
          <Link key={r.href} href={r.href} className="card block p-4 transition-colors hover:border-accent">
            <div className="font-display text-base font-bold">{r.title}</div>
            <p className="mt-1 text-sm text-muted">{r.body}</p>
            <span className="mt-2 inline-block text-sm font-medium text-accent">{r.cta} →</span>
          </Link>
        ))}
      </div>

      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold tracking-tight">HISTORY</h2>
        {needsReview > 0 && (
          <Link href="/ingest?status=proposed" className="text-sm text-accent">
            {needsReview} waiting for your review →
          </Link>
        )}
      </div>
      <SubmissionList submissions={submissions} canEdit={canEdit} />
    </div>
  );
}
