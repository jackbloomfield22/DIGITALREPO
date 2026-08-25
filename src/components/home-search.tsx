"use client";

export function HomeSearch() {
  return (
    <button
      className="flex w-full max-w-xl items-center justify-between rounded-md border border-line bg-surface px-4 py-3 text-left text-sm text-faint shadow-card transition-shadow hover:shadow-pop"
      onClick={() => window.dispatchEvent(new CustomEvent("open-command-bar"))}
    >
      <span>Search talent, formats, projects, companies, people…</span>
      <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px]">⌘K</kbd>
    </button>
  );
}
