"use client";

import { useToast } from "@/components/toast";

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
