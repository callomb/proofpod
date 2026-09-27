import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink, Card } from "@/components/ui";
import { getProject } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminNewTestTypePage(
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
      <h1 className="mb-6 text-[24px] font-semibold tracking-tight">New test</h1>

      <Link href={`/admin/projects/${projectId}/tests/new/pressure`}>
        <Card className="flex items-center justify-between p-4 active:bg-canvas hover:bg-canvas">
          <div>
            <p className="text-[15px] font-semibold">Pressure Test</p>
            <p className="mt-0.5 text-[13px] text-muted">Stage pressures, evidence, pass/fail</p>
          </div>
        </Card>
      </Link>
    </div>
  );
}
