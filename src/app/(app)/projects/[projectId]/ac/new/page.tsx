import { notFound } from "next/navigation";

import { NewAcSystemForm } from "@/components/ac/new-ac-system-form";
import { BackLink } from "@/components/ui";
import { getProject } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NewAcSystemPage(props: PageProps<"/projects/[projectId]/ac/new">) {
  const { projectId } = await props.params;
  const project = await getProject(projectId);
  if (!project) notFound();

  return (
    <div>
      <div className="mb-3">
        <BackLink href={`/projects/${projectId}`}>{project.name}</BackLink>
      </div>
      <h1 className="mb-5 text-[24px] font-semibold tracking-tight">New AC system</h1>
      <NewAcSystemForm projectId={projectId} />
    </div>
  );
}
