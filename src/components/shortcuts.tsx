"use client";

// Global keys. Single letters never fire while you are typing; only ⌘K and
// Escape work everywhere. G then a letter jumps to a section (the G expires
// after a second), C creates in the current section, / focuses search,
// ? shows this list. Lists and record pages add their own on top.

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "@/components/overlay";
import { CREATE_FOR_SECTION } from "@/lib/navigation";

const GO: Record<string, string> = { t: "/talent", p: "/projects", c: "/organizations", f: "/formats", o: "/opportunities", h: "/", i: "/ingest", a: "/archive" };

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable || !!el.closest?.('[cmdk-root], [role="dialog"]'));
};

export function Shortcuts({ isEditor }: { isEditor: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [help, setHelp] = useState(false);
  const panel = useDialogFocus(help, () => setHelp(false));
  useEffect(() => {
    let pendingG: number | null = null;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (typing(e.target)) return;
      const key = e.key;
      if (pendingG && Date.now() - pendingG < 1000 && GO[key.toLowerCase()]) { e.preventDefault(); pendingG = null; router.push(GO[key.toLowerCase()]); return; }
      pendingG = null;
      if (key === "g" || key === "G") { pendingG = Date.now(); return; }
      if (key === "?") { e.preventDefault(); setHelp((h) => !h); return; }
      if (key === "/") { e.preventDefault(); const box = document.querySelector<HTMLInputElement>('input[type="search"]'); if (box) box.focus(); else window.dispatchEvent(new CustomEvent("open-command-bar")); return; }
      if ((key === "c" || key === "C") && isEditor) { const section = "/" + (pathname.split("/")[1] ?? ""); if (CREATE_FOR_SECTION[section] || section === "/") { e.preventDefault(); window.dispatchEvent(new CustomEvent("open-create", { detail: { section } })); } return; }
      if ((key === "n" || key === "N") && isEditor && document.querySelector("[data-inline-field]")) { e.preventDefault(); window.dispatchEvent(new CustomEvent("open-quick-capture")); return; }
      if ((key === "e" || key === "E") && isEditor) { const name = document.querySelector<HTMLButtonElement>('h1 [data-inline-field]'); if (name) { e.preventDefault(); name.click(); } return; }
      if ((key === "l" || key === "L") && isEditor) { const add = document.querySelector<HTMLButtonElement>("[data-add-link]"); if (add) { e.preventDefault(); add.click(); add.scrollIntoView({ block: "center" }); } return; }
      if (key === "f" || key === "F") { window.dispatchEvent(new CustomEvent("open-filters")); return; }
    };
    const onOpen = () => setHelp(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-shortcuts", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("open-shortcuts", onOpen); };
  }, [router, pathname, isEditor]);
  if (!help) return null;
  const rows: [string, string][] = [
    ["⌘K", "Search and commands"], ["/", "Focus the search box"], ["?", "This list"], ["C", "Create in the current section"],
    ["G then T / P / C / F / O", "Go to Talent / Projects / Companies / Formats / Opportunities"], ["G then H / I / A", "Go Home / Ingest / Archive"],
    ["↑ ↓ (side panel)", "Previous / next record"], ["← →", "Previous / next record on a record page"], ["F", "Open filters on a list"],
    ["J / K", "Move down / up a list row"], ["X", "Select the focused row"], ["Space", "Peek at the focused row"], ["Enter", "Open the focused row"],
    ["E", "Edit the name of the record you are on"], ["N", "New note on this record"], ["L", "Link a record (opens the add box on the current tab)"], ["S", "Change status on a record page"], ["Esc", "Cancel an editor, then close the palette, then the side panel, then clear a selection"],
  ];
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4"><div className="absolute inset-0 bg-ink/40" aria-hidden onClick={() => setHelp(false)} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" tabIndex={-1} className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-lg bg-surface p-5 shadow-pop">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Keyboard shortcuts</h2><button className="btn btn-ghost btn-sm" onClick={() => setHelp(false)} aria-label="Close">×</button></div>
        <dl className="grid grid-cols-[minmax(9rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">{rows.map(([k, v]) => <div key={k} className="contents"><dt><kbd className="rounded border border-line bg-wash px-1.5 py-0.5 text-xs">{k}</kbd></dt><dd className="text-charcoal">{v}</dd></div>)}</dl>
      </div>
    </div>, document.body);
}
