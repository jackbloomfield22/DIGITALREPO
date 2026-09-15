"use client";

// One polite live region for save status and other quiet confirmations, so
// a screen reader hears "Saved headline" without a toast having to exist.

import { useEffect, useState } from "react";

let listener: ((text: string) => void) | null = null;

/** Say something to assistive tech without showing it. */
export function announce(text: string) {
  listener?.(text);
}

export function LiveRegion() {
  const [text, setText] = useState("");
  useEffect(() => {
    listener = (t) => { setText(""); setTimeout(() => setText(t), 30); };
    return () => { listener = null; };
  }, []);
  return <div aria-live="polite" aria-atomic="true" className="sr-only">{text}</div>;
}
