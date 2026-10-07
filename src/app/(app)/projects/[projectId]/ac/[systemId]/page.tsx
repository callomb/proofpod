import { notFound } from "next/navigation";

import { AcSystemDashboard } from "@/components/ac/ac-system-dashboard";
import { acSystemCompletion } from "@/lib/ac/completion";
import {
  getAcCharge,
  getAcCommissioning,
  getAcEvacuation,
  getAcFgasLabelRequest,
  getAcSystem,
  listAcDrainTests,
  listAcPressureTests,
  listAcTemperatureReadings,
  listAcUnits,
} from "@/lib/ac/data";
import { getProject } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AcSystemPage(
  props: PageProps<"/projects/[projectId]/ac/[systemId]">,
) {
  const { projectId, systemId } = await props.params;
  const [project, system] = await Promise.all([getProject(projectId), getAcSystem(systemId)]);
  if (!project || !system || system.project_id !== projectId) notFound();

  const [units, pressureTests, evacuation, charge, commissioning, temperatureReadings, drainTests, fgasRequest] =
    await Promise.all([
      listAcUnits(systemId),
      listAcPressureTests(systemId),
      getAcEvacuation(systemId),
      getAcCharge(systemId),
      getAcCommissioning(systemId),
      listAcTemperatureReadings(systemId),
      listAcDrainTests(systemId),
      getAcFgasLabelRequest(systemId),
    ]);

  const completion = acSystemCompletion({
    projectId,
    system,
    units,
    pressureTests,
    evacuation,
    charge,
    commissioning,
    temperatureReadings,
    drainTests,
  });

  return (
    <AcSystemDashboard
      projectId={projectId}
      projectName={project.name}
      system={system}
      units={units}
      pressureTests={pressureTests}
      evacuation={evacuation}
      drainTests={drainTests}
      completion={completion}
      fgasRequest={fgasRequest}
    />
  );
}
