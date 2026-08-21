import Link from "next/link";
import { requireUser, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { Section } from "@/components/ui";
import { SavedViewList } from "@/components/saved-view-list";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const savedViews = await db.savedView.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 font-display text-3xl font-bold tracking-tight">SETTINGS</h1>

      <Section title="Account">
        <div className="card p-4 text-sm">
          <div className="flex justify-between py-1"><span className="text-muted">Name</span><span className="font-medium">{user.name}</span></div>
          <div className="flex justify-between py-1"><span className="text-muted">Email</span><span className="font-medium">{user.email}</span></div>
          <div className="flex justify-between py-1"><span className="text-muted">Role</span><span className="font-medium">{user.role}</span></div>
        </div>
        <p className="mt-2 text-xs text-faint">
          Viewers can read and search. Editors can create and edit content. Admins manage users,
          merging, and data health{hasRole(user, "ADMIN") && (
            <>
              {" "}— see <Link className="underline" href="/admin">Admin</Link>
            </>
          )}.
        </p>
      </Section>

      <Section title="My Saved Views">
        <SavedViewList
          views={savedViews.map((v) => ({
            id: v.id,
            name: v.name,
            href: `/${v.targetType}?${v.query}`,
            targetType: v.targetType,
          }))}
        />
      </Section>

      <Section title="Keyboard Shortcuts">
        <div className="card p-4 text-sm">
          <div className="flex justify-between py-1"><span className="text-muted">Global search / commands</span><kbd className="rounded border border-line px-1.5">⌘K / Ctrl+K</kbd></div>
          <div className="flex justify-between py-1"><span className="text-muted">Save while editing</span><kbd className="rounded border border-line px-1.5">⌘S / Ctrl+S</kbd></div>
          <div className="flex justify-between py-1"><span className="text-muted">Close drawer / dialog</span><kbd className="rounded border border-line px-1.5">Esc</kbd></div>
        </div>
      </Section>
    </div>
  );
}
