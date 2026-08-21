"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Toast = {
  id: number;
  message: string;
  undo?: () => void | Promise<void>;
  tone?: "default" | "error";
};

const ToastContext = createContext<{
  toast: (message: string, opts?: { undo?: () => void | Promise<void>; tone?: "default" | "error" }) => void;
}>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, opts?: { undo?: () => void | Promise<void>; tone?: "default" | "error" }) => {
      const id = ++idRef.current;
      setToasts((t) => [...t.slice(-3), { id, message, undo: opts?.undo, tone: opts?.tone }]);
      setTimeout(() => dismiss(id), opts?.undo ? 8000 : 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-5 left-1/2 z-[90] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-auto items-center gap-3 rounded-md px-4 py-2.5 text-sm shadow-pop ${
              t.tone === "error"
                ? "bg-accent-deep text-white"
                : "bg-ink text-paper"
            }`}
          >
            <span>{t.message}</span>
            {t.undo && (
              <button
                className="font-semibold underline underline-offset-2 hover:opacity-80"
                onClick={async () => {
                  dismiss(t.id);
                  await t.undo?.();
                }}
              >
                Undo
              </button>
            )}
            <button
              aria-label="Dismiss"
              className="opacity-60 hover:opacity-100"
              onClick={() => dismiss(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
