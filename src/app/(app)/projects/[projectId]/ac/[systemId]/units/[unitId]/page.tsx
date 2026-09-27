import { notFound } from "next/navigation";

import { UnitIdentifyForm } from "@/components/ac/unit-identify-form";
import { BackLink } from "@/components/ui";
import { getAcSystem, getAcUnit } from "@/lib/ac/data";

export const dynamic = "force-dynamic";

export default async function AcUnitPage(
  props: PageProps<"/projects/[projectId]/ac/[systemId]/units/[unitId]">,
) {
  const { projectId, systemId, unitId } = await props.params;
  const [system, unit] = await Promise.all([getAcSystem(systemId), getAcUnit(unitId)]);
  if (!system || !unit || system.project_id !== projectId || unit.ac_system_id !== systemId) {
    notFound();
  }

  const title = unit.unit_role === "outdoor" ? "Outdoor unit" : "Indoor unit";

  return (
    <div>
      <div className="mb-3">
        <BackLink href={`/projects/${projectId}/ac/${systemId}`}>{system.system_ref}</BackLink>
      </div>
      <h1 className="mb-5 text-[24px] font-semibold tracking-tight">{title}</h1>
      <UnitIdentifyForm
        unit={unit}
        companyId={system.company_id}
        projectId={projectId}
        acSystemId={systemId}
        role={unit.unit_role}
        showReference
        showLocation={unit.unit_role === "indoor"}
      />
    </div>
  );
}
