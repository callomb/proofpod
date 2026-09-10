import { notFound } from "next/navigation";

import { NewTestForm } from "@/components/new-test-form";
import { BackLink } from "@/components/ui";
import { getProject } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminNewTestPage(
  props: PageProps<"/admin/projects/[projectId]/tests/new">,
) {
  const { projectId } = await props.params;
  const project = await getProject(projectId);
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-[460px]">
      <div className="mb-3">
        <BackLink href={`/admin/projects/${projectId}`}>{project.name}</BackLink>
      </div>
      <h1 className="mb-1 text-[24px] font-semibold tracking-tight">New test</h1>
      <p className="mb-6 text-[15px] text-muted">
        Pre-create a test for {project.name}. The site operative will see it under
        In&nbsp;Progress and perform it.
      </p>
      <NewTestForm projectId={projectId} redirectBase="/admin/projects" />
    </div>
  );
}
