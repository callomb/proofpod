import { notFound } from "next/navigation";

import { NewTestForm } from "@/components/new-test-form";
import { BackLink } from "@/components/ui";
import { getProject } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NewTestPage(
  props: PageProps<"/projects/[projectId]/tests/new">,
) {
  const { projectId } = await props.params;
  const project = await getProject(projectId);
  if (!project) notFound();

  return (
    <div>
      <div className="mb-3">
        <BackLink href={`/projects/${projectId}`}>{project.name}</BackLink>
      </div>
      <h1 className="mb-1 text-[24px] font-semibold tracking-tight">New test</h1>
      <p className="mb-6 text-[15px] text-muted">{project.name}</p>
      <NewTestForm projectId={projectId} />
    </div>
  );
}
