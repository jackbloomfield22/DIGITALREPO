"use client";

// Files on a record — and, now that they can be a rough cut rather than a
// two-page PDF, files you can actually watch. A video plays in place, a PDF
// opens in a frame, an image shows itself; anything else is a link. Uploads go
// straight from here to storage with a real progress bar, because a 900MB file
// with a spinner and no number is indistinguishable from a hang.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { recordBlobUpload, recordDatabaseUpload, removeAttachment } from "@/lib/actions/attachments";

export type AttachmentVM = {
  id: string;
  filename: string;
  url: string;
  sizeBytes: number | null;
  mimeType: string | null;
  kind: "video" | "audio" | "image" | "pdf" | "file";
  durationSeconds: number | null;
  storage: string;
};

function readableSize(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function readableDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

const ICON: Record<AttachmentVM["kind"], string> = {
  video: "▶",
  audio: "♪",
  image: "▣",
  pdf: "▤",
  file: "📎",
};

/**
 * Video and audio carry a duration the browser can read before the file is
 * uploaded. Worth capturing — "cut_v3.mp4" tells you nothing, "cut_v3.mp4,
 * 1:42:07" tells you which cut it is.
 */
function readDuration(file: File): Promise<number | null> {
  const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : null;
  if (!kind) return Promise.resolve(null);
  return new Promise((resolve) => {
    const element = document.createElement(kind);
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    element.preload = "metadata";
    element.onloadedmetadata = () => done(Number.isFinite(element.duration) ? element.duration : null);
    element.onerror = () => done(null);
    element.src = url;
    // Some containers never fire either event; don't hold the upload for them.
    setTimeout(() => done(null), 4000);
  });
}

function Preview({ file }: { file: AttachmentVM }) {
  const [open, setOpen] = useState(false);

  if (file.kind === "video") {
    return (
      <video
        controls
        preload="metadata"
        className="mt-1.5 w-full max-w-xl rounded border border-line bg-ink"
        src={file.url}
      />
    );
  }
  if (file.kind === "audio") {
    return <audio controls preload="metadata" className="mt-1.5 w-full max-w-xl" src={file.url} />;
  }
  if (file.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={file.url}
        alt={file.filename}
        className="mt-1.5 max-h-80 w-auto max-w-full rounded border border-line"
      />
    );
  }
  if (file.kind === "pdf") {
    return open ? (
      <div className="mt-1.5">
        <iframe title={file.filename} src={file.url} className="h-[36rem] w-full max-w-3xl rounded border border-line" />
        <button className="mt-1 text-xs text-muted hover:text-accent" onClick={() => setOpen(false)}>
          Close preview
        </button>
      </div>
    ) : (
      <button className="mt-1 text-xs text-muted hover:text-accent" onClick={() => setOpen(true)}>
        Preview
      </button>
    );
  }
  return null;
}

export function AttachmentList({
  attachments,
  targetType,
  targetId,
  canEdit,
  blobReady,
  maxBytes,
}: {
  attachments: AttachmentVM[];
  targetType: string;
  targetId: string;
  canEdit: boolean;
  blobReady: boolean;
  maxBytes: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ name: string; percent: number } | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const upload = async (file: File) => {
    if (file.size > maxBytes) {
      toast(
        blobReady
          ? `${file.name} is over the ${Math.round(maxBytes / 1024 ** 3)}GB limit.`
          : `${file.name} is over 15MB. Large files need a Blob store connected in Vercel.`,
        { tone: "error" },
      );
      return;
    }
    setProgress({ name: file.name, percent: 0 });
    try {
      const durationSeconds = await readDuration(file);

      if (blobReady) {
        // Straight from the browser to storage: nothing of this size could
        // survive a round trip through a serverless function.
        const { upload: uploadToBlob } = await import("@vercel/blob/client");
        const blob = await uploadToBlob(file.name, file, {
          access: "private",
          handleUploadUrl: "/api/blob/upload",
          contentType: file.type || undefined,
          // Splits large files into parts, uploads them in parallel, and
          // retries the ones that fail rather than the whole upload.
          multipart: file.size > 8 * 1024 * 1024,
          onUploadProgress: ({ percentage }) =>
            setProgress({ name: file.name, percent: Math.round(percentage) }),
        });
        const res = await recordBlobUpload({
          targetType,
          targetId,
          filename: file.name,
          url: blob.url,
          mimeType: file.type || null,
          durationSeconds,
        });
        if (!res.ok) throw new Error(res.error);
      } else {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.onerror = () => reject(new Error("Could not read that file."));
          reader.readAsDataURL(file);
        });
        const res = await recordDatabaseUpload({
          targetType,
          targetId,
          filename: file.name,
          mimeType: file.type || null,
          base64,
        });
        if (!res.ok) throw new Error(res.error);
      }
      toast(`Attached ${file.name}`);
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", { tone: "error" });
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="space-y-2">
      <ul className="space-y-2.5">
        {attachments.map((a) => (
          <li key={a.id}>
            <div className="flex items-baseline gap-2 text-sm">
              <span aria-hidden className="shrink-0 text-faint">{ICON[a.kind]}</span>
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="truncate underline underline-offset-2 hover:text-accent-deep"
              >
                {a.filename}
              </a>
              <span className="shrink-0 text-xs text-faint">
                {[readableDuration(a.durationSeconds), readableSize(a.sizeBytes)].filter(Boolean).join(" · ")}
              </span>
              {canEdit && (
                <button
                  aria-label={`Delete ${a.filename}`}
                  className="shrink-0 text-muted hover:text-accent"
                  onClick={async () => {
                    if (!window.confirm(`Delete ${a.filename}? The file itself is removed too.`)) return;
                    const res = await removeAttachment(a.id);
                    toast(res.ok ? "File deleted" : (res.error ?? "Failed"), res.ok ? {} : { tone: "error" });
                    router.refresh();
                  }}
                >
                  ×
                </button>
              )}
            </div>
            <Preview file={a} />
          </li>
        ))}
        {attachments.length === 0 && <li className="text-sm text-faint">No files attached.</li>}
      </ul>

      {progress && (
        <div className="max-w-md">
          <div className="flex items-baseline justify-between text-xs text-muted">
            <span className="truncate">{progress.name}</span>
            <span className="tabular-nums">{progress.percent}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded bg-wash">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      )}

      {canEdit && (
        <>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              for (const file of files) await upload(file);
            }}
          />
          <div className="flex items-baseline gap-2">
            <button
              className="chip border-dashed text-muted"
              disabled={!!progress}
              onClick={() => fileRef.current?.click()}
            >
              {progress ? "Uploading…" : "+ Attach Files"}
            </button>
            <span className="text-xs text-faint">
              {blobReady
                ? `Decks, PDFs, images, video — up to ${Math.round(maxBytes / 1024 ** 3)}GB each`
                : "Up to 15MB each until a Blob store is connected"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
