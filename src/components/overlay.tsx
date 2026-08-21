"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

function useEscape(onClose: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
}

function useBodyLock(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
}

/** Right-side drawer for quick edits, previews, and contextual tasks. */
export function Drawer({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEscape(onClose);
  useBodyLock(open);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <div
        className="absolute inset-0 bg-ink/30"
        aria-hidden
        onClick={onClose}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`absolute right-0 top-0 flex h-full w-full flex-col bg-paper shadow-pop outline-none ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line bg-surface px-5 py-3">
          <div className="min-w-0 text-sm font-semibold">{title}</div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="btn btn-ghost btn-sm -mr-2 text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Centered modal for focused confirmations. */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  useEscape(onClose);
  useBodyLock(open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-lg bg-surface p-5 shadow-pop"
      >
        {title && <h2 className="mb-3 text-base font-semibold">{title}</h2>}
        {children}
      </div>
    </div>,
    document.body,
  );
}
