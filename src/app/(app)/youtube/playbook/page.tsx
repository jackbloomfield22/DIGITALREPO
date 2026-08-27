import { requireUser, hasRole } from "@/lib/auth";
import { getOrCreateDoc } from "@/lib/docs";
import { DocEditor } from "@/components/doc-editor";
import { YouTubeHeader } from "@/components/youtube-nav";

export const metadata = { title: "YouTube Playbook" };

// What the business has learned, kept where the business lives. The same
// document machinery as the Dev Slate — it saves itself, keeps versions, and
// takes an uploaded file — pointed at a second document.

export default async function YouTubePlaybookPage() {
  const user = await requireUser();
  const doc = await getOrCreateDoc("youtube-playbook", "YouTube Playbook");
  const canEdit = hasRole(user, "EDITOR");

  return (
    <div className="max-w-3xl">
      <YouTubeHeader active="/youtube/playbook" />

      {!doc.content && (
        <div className="mb-5 rounded-md border border-dashed border-line-strong bg-wash/50 px-4 py-3 text-sm text-muted">
          Empty so far. This is the place for how the channels business actually works —
          what a good thumbnail looks like, the cadence that holds an audience, what a
          launch needs, the numbers worth beating.{" "}
          {canEdit ? "Start typing, or upload something you already have." : "An editor can fill it in."}
        </div>
      )}

      <DocEditor
        slug="youtube-playbook"
        initialContent={doc.content}
        initialVersion={doc.version}
        updatedAt={doc.updatedAt.toISOString()}
        updatedBy={doc.updatedByName}
        canEdit={canEdit}
      />
    </div>
  );
}
