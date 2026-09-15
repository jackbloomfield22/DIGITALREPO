import { Suspense } from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { PageTrail } from "@/components/page-trail";
import { ListMemory } from "@/components/list-memory";
import { requireUser, hasRole } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { CommandPalette } from "@/components/command-bar";
import { QuickCapture } from "@/components/quick-capture";
import { PeekPanel } from "@/components/peek-panel";
import { PrefsProvider } from "@/components/prefs-provider";
import { Shortcuts } from "@/components/shortcuts";
import { CreateSheet } from "@/components/create-sheet";
import { isOwner } from "@/lib/hq/owner";
import { readPrefs } from "@/lib/prefs";
import { sidebarLists } from "@/lib/record-refs";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [prefs, lists] = await Promise.all([readPrefs(user.id), sidebarLists(user.id)]);
  const permissions = { isAdmin: hasRole(user, "ADMIN"), isEditor: hasRole(user, "EDITOR"), isOwner: isOwner(user) };
  return (
    <NuqsAdapter>
      <PrefsProvider initial={prefs}>
        <Sidebar {...permissions} userName={user.name} favorites={lists.favorites} recents={lists.recents} />
        <Suspense><CommandPalette {...permissions} recents={lists.recents} /></Suspense>
        <Suspense><Shortcuts isEditor={permissions.isEditor} /></Suspense>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-surface focus:p-3">Skip to content</a>
        <main id="main-content" className="min-h-screen pb-16 pt-14 transition-[padding] lg:pb-0 lg:pl-60 lg:pt-0 peek-open:lg:pr-[28rem]">
          <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8"><Suspense><PageTrail /><ListMemory /></Suspense>{children}</div>
        </main>
        <Suspense><PeekPanel canEdit={permissions.isEditor} /></Suspense>
        {permissions.isEditor && <QuickCapture />}
        {permissions.isEditor && <CreateSheet isEditor />}
      </PrefsProvider>
    </NuqsAdapter>
  );
}
