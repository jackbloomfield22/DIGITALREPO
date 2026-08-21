"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useToast } from "@/components/toast";

/** Compact fixed header that appears once the main profile header scrolls away. */
export function StickyMiniHeader({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 260);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!visible) return null;
  return (
    <div className="no-print fixed inset-x-0 top-0 z-30 border-b border-line bg-surface/95 backdrop-blur lg:left-52">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 lg:px-8">
        {children}
      </div>
    </div>
  );
}

export function CopySummaryButton({ summary }: { summary: string }) {
  const { toast } = useToast();
  return (
    <button
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(summary);
          toast("Summary copied to clipboard");
        } catch {
          toast("Could not copy", { tone: "error" });
        }
      }}
    >
      Copy Summary
    </button>
  );
}

export function PrintButton() {
  return (
    <button className="btn btn-secondary btn-sm no-print" onClick={() => window.print()}>
      Print
    </button>
  );
}
