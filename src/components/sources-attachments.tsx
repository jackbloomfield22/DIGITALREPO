"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addSourceToRecord, removeRecordSource } from "@/lib/actions/sources";
import { SOURCE_TYPES } from "@/lib/taxonomy";
import { useToast } from "@/components/toast";

export type SourceVM = {
  recordSourceId: string;
  title: string | null;
  url: string | null;
  sourceType: string | null;
  addedBy?: string | null;
};

export function SourceList({
  sources,
  targetType,
  targetId,
  canEdit,
}: {
  sources: SourceVM[];
  targetType: string;
  targetId: string;
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [sourceType, setSourceType] = useState("public");
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="space-y-2">
      {sources.length === 0 && !canEdit && (
        <p className="text-sm text-faint">No sources recorded.</p>
      )}
      <ul className="space-y-1.5">
        {sources.map((s) => (
          <li key={s.recordSourceId} className="flex items-baseline gap-2 text-sm">
            {s.url ? (
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-charcoal underline underline-offset-2 hover:text-accent-deep"
              >
                {s.title || s.url}
              </a>
            ) : (
              <span className="truncate">{s.title}</span>
            )}
            {s.sourceType && (
              <span className="shrink-0 text-xs text-faint">{s.sourceType.replace(/_/g, " ")}</span>
            )}
            {canEdit && (
              <button
                aria-label="Remove source"
                className="shrink-0 text-muted hover:text-accent"
                onClick={async () => {
                  const res = await removeRecordSource(s.recordSourceId);
                  toast(res.ok ? "Source removed" : (res.error ?? "Failed"), res.ok ? {} : { tone: "error" });
                  router.refresh();
                }}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && !adding && (
        <button className="chip border-dashed text-muted" onClick={() => setAdding(true)}>
          + Add Source
        </button>
      )}
      {canEdit && adding && (
        <div className="max-w-md space-y-2 rounded-md border border-line bg-surface p-3">
          <input
            type="text"
            placeholder="Title / description"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Source title"
          />
          <input
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="Source URL"
          />
          <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} aria-label="Source type">
            {SOURCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              className="btn btn-primary btn-sm"
              onClick={async () => {
                const res = await addSourceToRecord({ targetType, targetId, title, url, sourceType });
                if (res.ok) {
                  toast("Source added");
                  setAdding(false);
                  setTitle("");
                  setUrl("");
                  router.refresh();
                } else toast(res.error ?? "Failed", { tone: "error" });
              }}
            >
              Add
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
