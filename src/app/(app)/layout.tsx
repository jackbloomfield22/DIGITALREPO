import { requireUser, hasRole } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { CommandBar } from "@/components/command-bar";

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
        userName={user.name}
      />
      <CommandBar />
      <main className="min-h-screen pt-12 lg:pl-52 lg:pt-0">
        <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
