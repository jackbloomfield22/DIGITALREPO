"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const dialogStack: HTMLElement[] = [];
let savedBodyOverflow = "";
const focusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** Shared focus containment, Escape handling and restoration for all overlays. */
export function useDialogFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open || !ref.current) return;
    const panel = ref.current;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialogStack.length) savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogStack.push(panel);
    const elements = () => [...panel.querySelectorAll<HTMLElement>(focusable)].filter((el) => el.getClientRects().length > 0);
    (panel.querySelector<HTMLElement>('[autofocus]') ?? elements()[0] ?? panel).focus();
    const keydown = (e: KeyboardEvent) => {
      if (dialogStack.at(-1) !== panel) return;
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); }
      if (e.key === "Tab") {
        const nodes = elements(); const first = nodes[0]; const last = nodes.at(-1);
        if (!first) { e.preventDefault(); panel.focus(); return; }
        if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement) || document.activeElement === panel)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      const topmost = dialogStack.at(-1) === panel;
      dialogStack.splice(dialogStack.indexOf(panel), 1);
      document.body.style.overflow = dialogStack.length ? "hidden" : savedBodyOverflow;
      if (topmost && before?.isConnected) before.focus();
    };
  }, [open]);
  return ref;
}
export function Drawer({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useDialogFocus(open, onClose); const id = useId();
  if (!open) return null;
  return createPortal(<div className="fixed inset-0 z-[70]"><div className="absolute inset-0 bg-ink/30" aria-hidden onClick={onClose} /><div ref={ref} role="dialog" aria-modal="true" aria-labelledby={title ? id : undefined} aria-label={title ? undefined : "Record details"} tabIndex={-1} className={`absolute right-0 top-0 flex h-full w-full flex-col bg-paper shadow-pop outline-none ${wide ? "max-w-2xl" : "max-w-md"}`}><div className="flex items-center justify-between border-b border-line bg-surface px-5 py-3"><div id={id} className="min-w-0 text-sm font-semibold">{title}</div><button aria-label="Close" onClick={onClose} className="btn btn-ghost btn-sm -mr-2 text-lg leading-none">×</button></div><div className="flex-1 overflow-y-auto px-5 py-4">{children}</div></div></div>, document.body);
}
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  const ref = useDialogFocus(open, onClose); const id = useId();
  if (!open) return null;
  return createPortal(<div className="fixed inset-0 z-[80] flex items-center justify-center p-4"><div className="absolute inset-0 bg-ink/40" aria-hidden onClick={onClose} /><div ref={ref} role="dialog" aria-modal="true" aria-labelledby={title ? id : undefined} aria-label={title ? undefined : "Confirmation"} tabIndex={-1} className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-lg bg-surface p-5 shadow-pop">{title && <h2 id={id} className="mb-3 text-base font-semibold">{title}</h2>}{children}</div></div>, document.body);
}
