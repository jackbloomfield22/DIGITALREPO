import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div>
      <nav className="mb-6 flex flex-wrap gap-1.5 border-b border-line pb-3 text-sm" aria-label="Settings">
        <Link className="chip" href="/settings">Account &amp; views</Link>
        <Link className="chip" href="/settings/options">Options</Link>
        <Link className="chip" href="/settings/fields">Fields</Link>
        <Link className="chip" href="/settings/health">Health</Link>
      </nav>
      {children}
    </div>
  );
}
