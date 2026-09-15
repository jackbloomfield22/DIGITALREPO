"use client";

// The rail. Always open on desktop, every item a word, the current section
// marked, and two living lists at the bottom: what you have starred and what
// you opened last. Sits on a slightly dimmer ground so the content stands out.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDialogFocus } from "@/components/overlay";
import { PRIMARY_NAV, WORKSPACE_NAV, TOOLS_NAV, CREATE_ITEMS, allowedNav, isNavActive, type NavItem } from "@/lib/navigation";
import { typeLabel } from "@/lib/record-types";

export type SidebarRef = { type: string; id: string; name: string; href: string; sub?: string };

type Props = { isAdmin: boolean; isEditor: boolean; isOwner: boolean; userName: string; favorites: SidebarRef[]; recents: SidebarRef[] };

function NavLinks(props: Props & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const { onNavigate } = props;
  const row = (item: NavItem) => (
    <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={isNavActive(pathname, item.href) ? "page" : undefined}
      className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors ${isNavActive(pathname, item.href) ? "bg-surface font-semibold text-accent-deep shadow-card" : "text-charcoal hover:bg-surface/70 hover:text-ink"}`}>
      <span>{item.label}</span>
      {item.shortcut && <span aria-hidden className="text-xs text-faint">{item.shortcut}</span>}
    </Link>
  );
  const recordRow = (r: SidebarRef) => (
    <Link key={`${r.type}:${r.id}`} href={r.href} onClick={onNavigate} aria-current={pathname === r.href ? "page" : undefined}
      className={`flex items-center gap-2 rounded-md px-3 py-1 text-sm ${pathname === r.href ? "bg-surface font-semibold text-accent-deep" : "text-charcoal hover:bg-surface/70"}`} title={r.sub ? `${r.name} — ${r.sub}` : r.name}>
      <span className="truncate">{r.name}</span>
      <span className="ml-auto shrink-0 text-xs uppercase tracking-wide text-faint">{typeLabel(r.type)}</span>
    </Link>
  );
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-3 pt-5">
        <Link href="/" onClick={onNavigate} className="mb-3 block px-2"><div className="font-display text-xl font-bold leading-none">4.4.FORTY</div><div className="overline mt-1">The Repo</div></Link>
        <button type="button" className="mb-2 flex w-full items-center justify-between rounded-md border border-line-strong bg-surface px-3 py-2 text-left text-sm text-muted hover:border-accent hover:text-ink"
          onClick={() => { onNavigate?.(); window.dispatchEvent(new CustomEvent("open-command-bar")); }}>
          <span>Search or jump to…</span><kbd className="rounded border border-line px-1.5 text-xs text-faint">⌘K</kbd>
        </button>
        {props.isEditor && (
          <div className="relative" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setCreateOpen(false); } }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setCreateOpen(false); }}>
            <button type="button" className="btn btn-accent w-full" onClick={() => setCreateOpen(!createOpen)} aria-expanded={createOpen}>+ Add new <span className="ml-1 text-xs opacity-70">C</span></button>
            {createOpen && <><div className="fixed inset-0 z-10" aria-hidden onClick={() => setCreateOpen(false)} /><div className="absolute inset-x-0 z-20 mt-1 rounded-md border border-line bg-surface p-1 shadow-pop">{allowedNav(CREATE_ITEMS, props).map((item) => <Link key={item.href} href={item.href} className="block rounded px-3 py-2 text-sm hover:bg-wash" onClick={() => { setCreateOpen(false); onNavigate?.(); }}>{item.label}</Link>)}</div></>}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 pb-4">
        <nav aria-label="Main">{allowedNav(PRIMARY_NAV, props).map(row)}</nav>
        <div>
          <div className="overline mb-1 px-3">Workspaces</div>
          <nav aria-label="Workspaces">{allowedNav(WORKSPACE_NAV, props).map(row)}</nav>
        </div>
        <div>
          <button type="button" className="overline mb-1 flex w-full items-center justify-between px-3 py-1 text-left hover:text-accent" aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}><span>Tools</span><span aria-hidden>{toolsOpen ? "−" : "+"}</span></button>
          {toolsOpen && <nav aria-label="Tools">{allowedNav(TOOLS_NAV, props).map(row)}</nav>}
        </div>
        <div>
          <div className="overline mb-1 flex items-center justify-between px-3"><span>Favorites</span><Link href="/favorites" onClick={onNavigate} className="font-normal normal-case tracking-normal text-faint hover:text-accent">all</Link></div>
          {props.favorites.length ? <nav aria-label="Favorites">{props.favorites.map(recordRow)}</nav> : <p className="px-3 text-xs text-faint">Star a record and it lands here.</p>}
        </div>
        <div>
          <div className="overline mb-1 flex items-center justify-between px-3"><span>Recent</span><Link href="/recent" onClick={onNavigate} className="font-normal normal-case tracking-normal text-faint hover:text-accent">all</Link></div>
          {props.recents.length ? <nav aria-label="Recently opened">{props.recents.map(recordRow)}</nav> : <p className="px-3 text-xs text-faint">Records you open show up here.</p>}
        </div>
      </div>
      <div className="border-t border-line px-3 py-3">
        <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted"><span className="truncate">{props.userName}</span><form action="/api/logout" method="post"><button className="shrink-0 py-1 hover:text-accent">Sign out</button></form></div>
      </div>
    </div>
  );
}

export function Sidebar(props: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const dialogRef = useDialogFocus(mobileOpen, () => setMobileOpen(false));
  const pathname = usePathname();
  const last = useRef(pathname);
  useEffect(() => { if (last.current !== pathname) { last.current = pathname; setMobileOpen(false); } }, [pathname]);
  return <>
    <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-line bg-wash lg:block"><NavLinks {...props} /></aside>
    <div className="no-print fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-surface px-3 lg:hidden">
      <button aria-label="Open navigation" aria-expanded={mobileOpen} className="btn btn-ghost min-h-10" onClick={() => setMobileOpen(true)}>☰ Menu</button>
      <Link href="/" className="font-display text-sm font-bold">4.4.FORTY REPO</Link>
      <button className="btn btn-ghost min-h-10" onClick={() => window.dispatchEvent(new CustomEvent("open-command-bar"))}>Search</button>
    </div>
    <nav aria-label="Sections" className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      {[{ href: "/", label: "Home" }, { href: "/talent", label: "Talent" }, { href: "/projects", label: "Projects" }, { href: "/formats", label: "Formats" }].map((t) => (
        <Link key={t.href} href={t.href} aria-current={isNavActive(pathname, t.href) ? "page" : undefined} className={`flex min-h-12 items-center justify-center text-xs font-medium ${isNavActive(pathname, t.href) ? "text-accent-deep" : "text-muted"}`}>{t.label}</Link>
      ))}
      <button type="button" className="flex min-h-12 items-center justify-center text-xs font-medium text-muted" aria-label="More sections" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}>More</button>
    </nav>
    {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden"><div className="absolute inset-0 bg-ink/30" aria-hidden onClick={() => setMobileOpen(false)} /><div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Navigation" tabIndex={-1} className="absolute inset-y-0 left-0 w-72 max-w-[90vw] bg-wash shadow-pop"><button className="absolute right-3 top-3 z-10 min-h-10 min-w-10 px-3 py-2" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>×</button><NavLinks {...props} onNavigate={() => setMobileOpen(false)} /></div></div>}
  </>;
}
