import { Suspense } from "react";
import { PageTrail } from "@/components/page-trail";
import { requireUser, hasRole } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { CommandBar } from "@/components/command-bar";
import { QuickCapture } from "@/components/quick-capture";
import { isOwner } from "@/lib/hq/owner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <div>
      <Sidebar
        isAdmin={hasRole(user, "ADMIN")}
        isEditor={hasRole(user, "EDITOR")}
        isOwner={isOwner(user)}
        userName={user.name}
      />
      <CommandBar isEditor={hasRole(user, "EDITOR")} isAdmin={hasRole(user, "ADMIN")} isOwner={isOwner(user)} />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-surface focus:p-3">Skip to content</a>
      <main id="main-content" className="min-h-screen pt-14 lg:pl-56 lg:pt-0">
        <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8"><Suspense><PageTrail /></Suspense>{children}</div>
      </main>
      {hasRole(user, "EDITOR") && <QuickCapture />}
    </div>
  );
}
