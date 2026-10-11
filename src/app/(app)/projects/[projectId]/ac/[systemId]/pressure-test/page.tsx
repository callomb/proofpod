import { notFound } from "next/navigation";

import { PressureTestPanel } from "@/components/ac/pressure-test-panel";
import { BackLink } from "@/components/ui";
import {
  getAcSystem,
  listAcPhotos,
  listAcPressureTestStages,
  listAcPressureTests,
  signAcEvidenceUrls,
} from "@/lib/ac/data";
import { getWorkspace } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AcPressureTestPage(
  props: PageProps<"/projects/[projectId]/ac/[systemId]/pressure-test">,
) {
  const { projectId, systemId } = await props.params;
  const [system, { memberNames }, attempts, allPhotos] = await Promise.all([
    getAcSystem(systemId),
    getWorkspace(),
    listAcPressureTests(systemId),
    listAcPhotos(systemId),
  ]);
  if (!system || system.project_id !== projectId) notFound();

  const photos = allPhotos.filter((p) => p.subject === "pressure_start" || p.subject === "pressure_end");
  const [stages, photoUrls] = await Promise.all([
    listAcPressureTestStages(attempts.map((a) => a.id)),
    signAcEvidenceUrls(photos.map((p) => p.storage_path)),
  ]);

  return (
    <div>
      <div className="mb-3">
        <BackLink href={`/projects/${projectId}/ac/${systemId}`}>{system.system_ref}</BackLink>
      </div>
      <h1 className="mb-5 text-[24px] font-semibold tracking-tight">Pressure Test</h1>
      <PressureTestPanel
        acSystemId={systemId}
        folderId={systemId}
        companyId={system.company_id}
        projectId={projectId}
        attempts={attempts}
        stages={stages}
        photos={photos}
        photoUrls={photoUrls}
        memberNames={memberNames}
        doneHref={`/projects/${projectId}/ac/${systemId}`}
        doneLabel={system.system_ref}
      />
    </div>
  );
}
