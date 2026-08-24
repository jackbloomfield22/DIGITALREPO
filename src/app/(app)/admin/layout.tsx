import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, hasRole } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!hasRole(user, "ADMIN")) redirect("/talent");
  return (
    <div>
      <nav className="mb-6 flex flex-wrap gap-1.5 border-b border-line pb-3 text-sm" aria-label="Admin">
        <Link className="chip" href="/admin">Overview & Users</Link>
        <Link className="chip" href="/admin/data-health">Data Health</Link>
        <Link className="chip" href="/admin/entities">Entities</Link>
        <Link className="chip" href="/admin/import">Import</Link>
        <Link className="chip" href="/admin/backups">Backups</Link>
        <Link className="chip" href="/admin/ingest">Ingest</Link>
      </nav>
      {children}
    </div>
  );
}
