import { notFound } from "next/navigation";

import { PressureTestPanel } from "@/components/ac/pressure-test-panel";
import { BackLink } from "@/components/ui";
import { getAcSystem, listAcPhotos, listAcPressureTests, signAcEvidenceUrls } from "@/lib/ac/data";
import { getWorkspace } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AcPressureTestPage(
  props: PageProps<"/projects/[projectId]/ac/[systemId]/pressure-test">,
) {
  const { projectId, systemId } = await props.params;
  const [system, { memberNames }] = await Promise.all([getAcSystem(systemId), getWorkspace()]);
  if (!system || system.project_id !== projectId) notFound();

  const [attempts, allPhotos] = await Promise.all([
    listAcPressureTests(systemId),
    listAcPhotos(systemId),
  ]);
  const photos = allPhotos.filter((p) => p.subject === "pressure_start" || p.subject === "pressure_end");
  const photoUrls = await signAcEvidenceUrls(photos.map((p) => p.storage_path));

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
        photos={photos}
        photoUrls={photoUrls}
        memberNames={memberNames}
      />
    </div>
  );
}
