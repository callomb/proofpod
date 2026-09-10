import { notFound } from "next/navigation";

import { ProjectEditForm } from "@/components/project-edit-form";
import { BackLink } from "@/components/ui";
import { getProject } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ProjectEditPage(
  props: PageProps<"/projects/[projectId]/edit">,
) {
  const { projectId } = await props.params;
  const project = await getProject(projectId);
  if (!project) notFound();

  return (
    <div>
      <div className="mb-3">
        <BackLink href={`/projects/${projectId}`}>{project.name}</BackLink>
      </div>
      <h1 className="mb-6 text-[24px] font-semibold tracking-tight">Project details</h1>
      <ProjectEditForm project={project} />
    </div>
  );
}
