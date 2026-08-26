import { requireUser, hasRole } from "@/lib/auth";
import { DEV_SLATE_SLUG, getOrCreateDoc } from "@/lib/docs";
import { DocEditor } from "@/components/doc-editor";

export const metadata = { title: "Dev Slate" };

// The development slate, in the Repo rather than linked from it. It is the
// document the whole company works off, and it used to live somewhere else —
// which meant the Repo could describe every project on it without ever being
// able to show you the slate itself.

export default async function DevSlatePage() {
  const user = await requireUser();
  const doc = await getOrCreateDoc(DEV_SLATE_SLUG, "Development Slate");
  const canEdit = hasRole(user, "EDITOR");

  return (
    <div className="max-w-3xl">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tight">DEV SLATE</h1>
      </div>
      <p className="mb-5 max-w-2xl text-sm text-muted">
        The working slate, kept here rather than linked from here. Edit it like any
        document — it saves itself as you type. Upload an exported copy to replace it
        wholesale; the version it replaces is always kept.
      </p>

      {!doc.content && (
        <div className="mb-5 rounded-md border border-dashed border-line-strong bg-wash/50 px-4 py-3 text-sm text-muted">
          Nothing here yet. {canEdit ? (
            <>Press <span className="text-charcoal">Upload</span> and pick the slate — a PDF, a
            Word file, or plain text — and it comes in formatted and ready to edit.</>
          ) : (
            <>An editor can add it.</>
          )}
        </div>
      )}

      <DocEditor
        slug={DEV_SLATE_SLUG}
        initialContent={doc.content}
        initialVersion={doc.version}
        updatedAt={doc.updatedAt.toISOString()}
        updatedBy={doc.updatedByName}
        canEdit={canEdit}
      />
    </div>
  );
}
