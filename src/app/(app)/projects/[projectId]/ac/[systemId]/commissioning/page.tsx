import { notFound } from "next/navigation";

import { CommissioningPanel } from "@/components/ac/commissioning-panel";
import { BackLink } from "@/components/ui";
import { getAcCommissioning, getAcSystem, listAcTemperatureReadings, listAcUnits } from "@/lib/ac/data";
import { indoorUnits } from "@/lib/ac/domain";
import { getWorkspace } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AcCommissioningPage(
  props: PageProps<"/projects/[projectId]/ac/[systemId]/commissioning">,
) {
  const { projectId, systemId } = await props.params;
  const [system, { memberNames }] = await Promise.all([getAcSystem(systemId), getWorkspace()]);
  if (!system || system.project_id !== projectId) notFound();

  const [commissioning, units, temperatureReadings] = await Promise.all([
    getAcCommissioning(systemId),
    listAcUnits(systemId),
    listAcTemperatureReadings(systemId),
  ]);
  if (!commissioning) notFound();

  return (
    <div>
      <div className="mb-3">
        <BackLink href={`/projects/${projectId}/ac/${systemId}`}>{system.system_ref}</BackLink>
      </div>
      <h1 className="mb-5 text-[24px] font-semibold tracking-tight">Commissioning</h1>
      <CommissioningPanel
        acSystemId={systemId}
        commissioning={commissioning}
        indoorUnits={indoorUnits(units)}
        temperatureReadings={temperatureReadings}
        memberNames={memberNames}
      />
    </div>
  );
}
