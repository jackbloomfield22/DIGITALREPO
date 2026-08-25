"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// Navigation communicates the product hierarchy: pillars of the Repo first,
// research modes second, personal utilities third, operations fourth, system
// last. Development and Industry are parents with their two halves indented —
// a new teammate should read this list and understand the company.

type NavChild = { href: string; label: string };
type NavItem = { href: string; label: string; children?: NavChild[] };
type NavGroup = { label: string | null; items: NavItem[] };

const GROUPS: NavGroup[] = [
  { label: null, items: [{ href: "/", label: "Home" }] },
  {
    label: "The Repo",
    items: [
      { href: "/talent", label: "Talent" },
      {
        href: "/development",
        label: "Development",
        children: [
          { href: "/formats", label: "Formats" },
          { href: "/opportunities", label: "Opportunities" },
        ],
      },
      { href: "/projects", label: "Projects" },
      {
        href: "/industry",
        label: "Industry",
        children: [
          { href: "/organizations", label: "Organizations" },
          { href: "/people", label: "People" },
        ],
      },
      { href: "/calendar", label: "Calendar" },
    ],
  },
  {
    label: "Research",
    items: [
      { href: "/explore", label: "Explore" },
      { href: "/ai", label: "AI Search" },
      { href: "/ingest", label: "Ingest" },
    ],
  },
  {
    label: "My Repo",
    items: [
      { href: "/collections", label: "Collections" },
      { href: "/favorites", label: "Favorites" },
      { href: "/recent", label: "Recent" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/attention", label: "Needs Attention" },
      { href: "/activity", label: "Activity" },
      { href: "/archive", label: "Archive" },
    ],
  },
];

const CREATE_ITEMS = [
  { href: "/talent/new", label: "New Talent" },
  { href: "/formats/new", label: "New Format" },
  { href: "/projects/new", label: "New Project" },
  { href: "/opportunities/new", label: "New Opportunity" },
  { href: "/organizations/new", label: "New Organization" },
  { href: "/people/new", label: "New Industry Person" },
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

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  const row = (item: NavChild, opts?: { child?: boolean; parentOfActive?: boolean }) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        className={`block rounded py-1.5 transition-colors ${
          opts?.child ? "pl-7 pr-3 text-[13px]" : "px-3 text-sm"
        } ${
          active
            ? "bg-wash font-semibold text-ink"
            : opts?.parentOfActive
              ? "font-medium text-ink hover:bg-wash"
              : "text-muted hover:bg-wash hover:text-ink"
        }`}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Link href="/" onClick={onNavigate} className="block px-3 pb-4 pt-4">
        <div className="font-display text-lg font-bold leading-none tracking-tight">
          4.4.FORTY
        </div>
        <div className="overline mt-1">The Repo</div>
      </Link>

      {isEditor && (
        <div className="relative mb-3 px-3">
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

      <button
        className="mx-3 mb-3 flex items-center justify-between rounded border border-line px-3 py-1.5 text-sm text-faint hover:border-line-strong hover:text-muted"
        onClick={() => window.dispatchEvent(new CustomEvent("open-command-bar"))}
      >
        <span>Search the Repo…</span>
        <kbd className="rounded border border-line px-1 text-[10px]">⌘K</kbd>
      </button>

      {GROUPS.map((group, gi) => (
        <div key={group.label ?? gi} className={gi === 0 ? "px-2" : "mt-4 px-2"}>
          {group.label && <div className="overline mb-1 px-3">{group.label}</div>}
          <nav aria-label={group.label ?? "Home"} className="space-y-0.5">
            {group.items.map((item) => {
              const childActive = item.children?.some((c) => isActive(c.href)) ?? false;
              return (
                <div key={item.href}>
                  {row(item, { parentOfActive: childActive })}
                  {item.children?.map((c) => row(c, { child: true }))}
                </div>
              );
            })}
          </nav>
        </div>
      ))}

      <div className="mt-auto space-y-0.5 px-2 pb-4 pt-6">
        {isAdmin && row({ href: "/admin", label: "Admin" })}
        {row({ href: "/settings", label: "Settings" })}
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
        <Link href="/" className="font-display text-sm font-bold">
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
