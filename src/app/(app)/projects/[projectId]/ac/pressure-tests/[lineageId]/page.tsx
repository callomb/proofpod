import { notFound } from "next/navigation";

import { PressureTestPanel } from "@/components/ac/pressure-test-panel";
import { BackLink } from "@/components/ui";
import {
  listAcPhotosForPressureTests,
  listAcPressureTestsByLineage,
  signAcEvidenceUrls,
} from "@/lib/ac/data";
import { getProject, getWorkspace } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function StandaloneAcPressureTestPage(
  props: PageProps<"/projects/[projectId]/ac/pressure-tests/[lineageId]">,
) {
  const { projectId, lineageId } = await props.params;
  const [project, { memberNames }] = await Promise.all([getProject(projectId), getWorkspace()]);
  if (!project) notFound();

  const attempts = await listAcPressureTestsByLineage(lineageId);
  if (attempts.length === 0 || attempts[0].project_id !== projectId) notFound();

  const allPhotos = await listAcPhotosForPressureTests(attempts.map((a) => a.id));
  const photos = allPhotos.filter((p) => p.subject === "pressure_start" || p.subject === "pressure_end");
  const photoUrls = await signAcEvidenceUrls(photos.map((p) => p.storage_path));

  return (
    <div>
      <div className="mb-3">
        <BackLink href={`/projects/${projectId}?module=ac_commissioning`}>{project.name}</BackLink>
      </div>
      <h1 className="mb-1 text-[24px] font-semibold tracking-tight">Pressure Test</h1>
      <p className="mb-5 text-[15px] text-muted">{attempts[0].reference}</p>
      <PressureTestPanel
        acSystemId={null}
        folderId={lineageId}
        companyId={project.company_id}
        projectId={projectId}
        attempts={attempts}
        photos={photos}
        photoUrls={photoUrls}
        memberNames={memberNames}
      />
    </div>
  );
}
