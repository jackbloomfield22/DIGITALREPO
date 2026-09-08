"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_GROUPS, CREATE_ITEMS, allowedNav, isNavActive } from "@/lib/navigation";
import { useDialogFocus } from "@/components/overlay";

type Props = { isAdmin: boolean; isOwner?: boolean; isEditor: boolean; userName: string };
function NavLinks({ onNavigate, ...props }: Props & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const row = (item: { href: string; label: string; description?: string }) => <Link key={item.href} href={item.href} onClick={onNavigate} title={item.description} aria-current={isNavActive(pathname, item.href) ? "page" : undefined}
    className={`block rounded-md px-3 py-2 text-sm transition-colors ${isNavActive(pathname, item.href) ? "bg-accent-wash font-semibold text-accent-deep" : "text-muted hover:bg-wash hover:text-ink"}`}>{item.label}</Link>;
  return <div className="flex h-full flex-col">
    <div className="border-b border-line px-3 pb-3 pt-5">
      <Link href="/" onClick={onNavigate} className="mb-4 block px-2"><div className="font-display text-xl font-bold leading-none">4.4.FORTY</div><div className="overline mt-1">The Repo</div></Link>
      <Link href="/search" onClick={onNavigate} className="mb-2 flex items-center justify-between rounded-md border border-line-strong px-3 py-2 text-sm hover:border-accent"><span>Search everything</span><span aria-hidden>⌕</span></Link>
      <div className="flex gap-1">{row({ href: "/", label: "Home" })}<button className="btn btn-ghost btn-sm ml-auto" onClick={() => { onNavigate?.(); window.dispatchEvent(new CustomEvent("open-command-bar")); }} aria-label="Open quick search">⌘ / Ctrl K</button></div>
      {props.isEditor && <div className="relative mt-2" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setCreateOpen(false); } }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setCreateOpen(false); }}>
        <button className="btn btn-accent w-full" onClick={() => setCreateOpen(!createOpen)} aria-expanded={createOpen}>+ Add new</button>
        {createOpen && <><div className="fixed inset-0 z-10" aria-hidden onClick={() => setCreateOpen(false)} /><div className="absolute inset-x-0 z-20 mt-1 rounded-md border border-line bg-surface p-1 shadow-pop">{CREATE_ITEMS.map((item) => <Link key={item.href} href={item.href} className="block rounded px-3 py-2 text-sm hover:bg-wash" onClick={() => { setCreateOpen(false); onNavigate?.(); }}>{item.label}</Link>)}</div></>}
      </div>}
    </div>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-4">
      {NAV_GROUPS.map((group) => {
        const items = allowedNav(group.items, props);
        const active = items.some((i) => isNavActive(pathname, i.href));
        const open = expanded[group.label] ?? (!group.collapsed || active);
        return <div key={group.label}><button className="overline mb-1 flex w-full items-center justify-between px-3 py-1.5 text-left hover:text-accent" aria-expanded={open} onClick={() => setExpanded({ ...expanded, [group.label]: !open })}><span>{group.label}</span><span aria-hidden>{open ? "−" : "+"}</span></button>{open && <nav aria-label={group.label}>{items.map(row)}</nav>}</div>;
      })}
    </div>
    <div className="border-t border-line px-3 py-3"><div className="flex items-center gap-1">{props.isAdmin && row({ href: "/admin", label: "Admin" })}{row({ href: "/settings", label: "Settings" })}</div><div className="mt-2 flex items-center justify-between gap-2 px-3 text-xs text-muted"><span className="truncate">{props.userName}</span><form action="/api/logout" method="post"><button className="shrink-0 py-1 hover:text-accent">Sign out</button></form></div></div>
  </div>;
}
export function Sidebar(props: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const dialogRef = useDialogFocus(mobileOpen, () => setMobileOpen(false));
  return <>
    <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-56 border-r border-line bg-surface lg:block"><NavLinks {...props} /></aside>
    <div className="no-print fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-surface px-3 lg:hidden">
      <button aria-label="Open navigation" aria-expanded={mobileOpen} className="btn btn-ghost min-h-10" onClick={() => setMobileOpen(true)}>☰</button>
      <Link href="/" className="font-display text-sm font-bold">4.4.FORTY REPO</Link><Link href="/search" className="btn btn-ghost min-h-10">Search</Link>
    </div>
    {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden"><div className="absolute inset-0 bg-ink/30" aria-hidden onClick={() => setMobileOpen(false)} /><div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Navigation" tabIndex={-1} className="absolute inset-y-0 left-0 w-72 max-w-[90vw] bg-surface shadow-pop"><button className="absolute right-3 top-3 z-10 px-3 py-2" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>×</button><NavLinks {...props} onNavigate={() => setMobileOpen(false)} /></div></div>}
  </>;
}
