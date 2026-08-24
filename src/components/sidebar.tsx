"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const PRIMARY = [
  { href: "/talent", label: "Talent" },
  { href: "/formats", label: "Formats" },
  { href: "/projects", label: "Projects" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/calendar", label: "Calendar" },
  { href: "/explore", label: "Explore" },
  { href: "/ai", label: "AI Search" },
];

const SECONDARY = [
  { href: "/collections", label: "Collections" },
  { href: "/recent", label: "Recent" },
  { href: "/favorites", label: "Favorites" },
  { href: "/activity", label: "Activity" },
  { href: "/ingest", label: "Ingest" },
];

const CREATE_ITEMS = [
  { href: "/talent/new", label: "New Talent" },
  { href: "/formats/new", label: "New Format" },
  { href: "/projects/new", label: "New Project" },
  { href: "/opportunities/new", label: "New Opportunity" },
  { href: "/organizations/new", label: "New Organization" },
  { href: "/collections/new", label: "New Collection" },
];

function NavLinks({
  isAdmin,
  isEditor,
  userName,
  onNavigate,
}: {
  isAdmin: boolean;
  isEditor: boolean;
  userName: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);

  const link = (item: { href: string; label: string }) => {
    const active =
      pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        className={`block rounded px-3 py-1.5 text-sm transition-colors ${
          active
            ? "bg-wash font-semibold text-ink"
            : "text-muted hover:bg-wash hover:text-ink"
        }`}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <Link href="/talent" onClick={onNavigate} className="block px-3 pb-5 pt-4">
        <div className="font-display text-lg font-bold leading-none tracking-tight">
          4.4.FORTY
        </div>
        <div className="overline mt-1">The Repo</div>
      </Link>

      {isEditor && (
        <div className="relative mb-4 px-3">
          <button
            className="btn btn-accent w-full"
            onClick={() => setCreateOpen((v) => !v)}
            aria-expanded={createOpen}
            aria-haspopup="menu"
          >
            + Create
          </button>
          {createOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                aria-hidden
                onClick={() => setCreateOpen(false)}
              />
              <div
                role="menu"
                className="absolute left-3 right-3 z-20 mt-1 rounded-md border border-line bg-surface py-1 shadow-pop"
              >
                {CREATE_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    role="menuitem"
                    href={item.href}
                    onClick={() => {
                      setCreateOpen(false);
                      onNavigate?.();
                    }}
                    className="block px-3 py-1.5 text-sm text-charcoal hover:bg-wash"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <nav aria-label="Primary" className="space-y-0.5 px-2">
        {PRIMARY.map(link)}
      </nav>

      <div className="mt-6 px-2">
        <div className="overline mb-1 px-3">Library</div>
        <nav aria-label="Library" className="space-y-0.5">
          {SECONDARY.map(link)}
        </nav>
      </div>

      <div className="mt-auto space-y-0.5 px-2 pb-4">
        <button
          className="block w-full rounded px-3 py-1 text-left text-xs text-faint hover:text-muted"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("open-command-bar"))
          }
        >
          Search <kbd className="rounded border border-line px-1">⌘K</kbd>
        </button>
        {isAdmin && link({ href: "/admin", label: "Admin" })}
        {link({ href: "/settings", label: "Settings" })}
        <div className="flex items-center justify-between px-3 pt-2 text-xs text-faint">
          <span className="truncate">{userName}</span>
          <form action="/api/logout" method="post">
            <button className="hover:text-accent" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function Sidebar(props: {
  isAdmin: boolean;
  isEditor: boolean;
  userName: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-52 border-r border-line bg-surface lg:block">
        <NavLinks {...props} />
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 lg:hidden">
        <button
          aria-label="Open menu"
          className="btn btn-ghost btn-sm"
          onClick={() => setMobileOpen(true)}
        >
          ☰
        </button>
        <Link href="/talent" className="font-display text-sm font-bold">
          4.4.FORTY REPO
        </Link>
        <button
          aria-label="Search"
          className="btn btn-ghost btn-sm"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("open-command-bar"))
          }
        >
          ⌕
        </button>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/30"
            aria-hidden
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64 bg-surface shadow-pop">
            <NavLinks {...props} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
