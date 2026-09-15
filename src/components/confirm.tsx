"use client";

// One confirmation dialog for the whole app, asked for with a promise:
//   if (!(await confirm({ title: "Archive this?", action: "Archive" }))) return;
// It replaces window.confirm, so every "are you sure" looks the same, traps
// focus, and can carry a second line of explanation.

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Modal } from "@/components/overlay";

export type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  /** The confirming button's label. */
  action?: string;
  cancel?: string;
  /** Red for anything that removes or discards. */
  tone?: "default" | "danger";
};

const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(() => Promise.resolve(false));

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => { resolver.current = resolve; setCurrent(opts); }), []);
  const settle = (ok: boolean) => { resolver.current?.(ok); resolver.current = null; setCurrent(null); };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!current} onClose={() => settle(false)} title={current?.title}>
        {current?.message && <div className="text-sm text-muted">{current.message}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => settle(false)}>{current?.cancel ?? "Cancel"}</button>
          <button type="button" autoFocus className={`btn btn-sm ${current?.tone === "danger" ? "btn-accent" : "btn-primary"}`} onClick={() => settle(true)}>{current?.action ?? "Confirm"}</button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}
