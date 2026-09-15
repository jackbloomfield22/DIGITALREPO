"use client";

// The two-column record page: the Details column on the left, whose width you
// can drag (remembered per person), and the tabbed main column. Below the
// large breakpoint the two stack and the handle disappears.

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { usePrefs } from "@/components/prefs-provider";

const MIN = 240;
const MAX = 560;
const DEFAULT = 300;

export function RecordLayout({ children, details }: { children: ReactNode; details: ReactNode }) {
  const { prefs, update } = usePrefs();
  const [live, setLive] = useState<number | null>(null);
  const drag = useRef<{ startX: number; startW: number } | null>(null);
  const width = live ?? Math.min(MAX, Math.max(MIN, prefs.asideWidth ?? DEFAULT));

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { startX: e.clientX, startW: width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setLive(Math.min(MAX, Math.max(MIN, drag.current.startW + (e.clientX - drag.current.startX))));
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    if (live != null) { update({ asideWidth: live }); setLive(null); }
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 16;
    if (e.key === "ArrowLeft") { e.preventDefault(); update({ asideWidth: Math.max(MIN, width - step) }); }
    if (e.key === "ArrowRight") { e.preventDefault(); update({ asideWidth: Math.min(MAX, width + step) }); }
  };

  return (
    <div>
      <style>{`@media (min-width: 1024px) { .record-grid { grid-template-columns: ${width}px 1.25rem minmax(0, 1fr); } }`}</style>
      <div className="record-grid grid gap-6 lg:gap-0">
        <aside className="min-w-0 space-y-4 lg:pr-5">{details}</aside>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the details column"
          aria-valuenow={width}
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          tabIndex={0}
          className="group hidden cursor-col-resize items-stretch justify-center lg:flex focus-visible:outline-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKey}
        >
          <div className="w-px bg-line transition-colors group-hover:bg-accent group-focus-visible:bg-accent" />
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
