import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, hasRole } from "@/lib/auth";
import { RecordForm } from "@/components/record-form";
import { PROJECT_FIELDS } from "@/lib/form-fields";

export const metadata = { title: "Edit Project" };

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  if (!hasRole(user, "EDITOR")) redirect(`/projects/${slug}`);
  const project = await db.project.findUnique({ where: { slug } });
  if (!project) notFound();

  return (
    <RecordForm
      kind="project"
      heading={`Editing ${project.title}`}
      fields={PROJECT_FIELDS}
      initial={{
        id: project.id,
        slug: project.slug,
        version: project.version,
        values: {
          title: project.title,
          projectType: project.projectType ?? "",
          status: project.status,
          logline: project.logline ?? "",
          description: project.description ?? "",
          premiereYear: project.premiereYear?.toString() ?? "",
          endYear: project.endYear?.toString() ?? "",
          seasons: project.seasons?.toString() ?? "",
          episodes: project.episodes?.toString() ?? "",
          runtimeMinutes: project.runtimeMinutes?.toString() ?? "",
          country: project.country ?? "",
          trailerUrl: project.trailerUrl ?? "",
          officialUrl: project.officialUrl ?? "",
          imdbUrl: project.imdbUrl ?? "",
          youtubeUrl: project.youtubeUrl ?? "",
          internalNotes: project.internalNotes ?? "",
        },
      }}
    />
  );
}
