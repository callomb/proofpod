import { notFound } from "next/navigation";

import { NewStandaloneAcPressureTestForm } from "@/components/ac/new-standalone-pressure-test-form";
import { BackLink } from "@/components/ui";
import { getProject } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NewStandaloneAcPressureTestPage(
  props: PageProps<"/projects/[projectId]/ac/pressure-tests/new">,
) {
  const { projectId } = await props.params;
  const project = await getProject(projectId);
  if (!project) notFound();

  return (
    <div>
      <div className="mb-3">
        <BackLink href={`/projects/${projectId}/ac/new`}>System type</BackLink>
      </div>
      <h1 className="mb-1 text-[24px] font-semibold tracking-tight">Pressure Test</h1>
      <p className="mb-6 text-[15px] text-muted">{project.name}</p>
      <NewStandaloneAcPressureTestForm projectId={projectId} />
    </div>
  );
}
