import { notFound } from "next/navigation";

import { EvacuationChargePanel } from "@/components/ac/evacuation-charge-panel";
import { BackLink, LinkButton } from "@/components/ui";
import {
  getAcCharge,
  getAcEvacuation,
  getAcSystem,
  listAcChargeCalcLines,
  listAcChargeRates,
  listAcPhotos,
} from "@/lib/ac/data";

export const dynamic = "force-dynamic";

export default async function AcEvacuationChargePage(
  props: PageProps<"/projects/[projectId]/ac/[systemId]/evacuation-charge">,
) {
  const { projectId, systemId } = await props.params;
  const system = await getAcSystem(systemId);
  if (!system || system.project_id !== projectId) notFound();

  const [evacuation, charge, calcLines, rates, photos] = await Promise.all([
    getAcEvacuation(systemId),
    getAcCharge(systemId),
    listAcChargeCalcLines(systemId),
    listAcChargeRates(),
    listAcPhotos(systemId),
  ]);
  if (!evacuation || !charge) notFound();

  const hasFinalPhoto = photos.some((p) => p.subject === "evacuation_final");

  return (
    <div>
      <div className="mb-3">
        <BackLink href={`/projects/${projectId}/ac/${systemId}`}>{system.system_ref}</BackLink>
      </div>
      <h1 className="mb-5 text-[24px] font-semibold tracking-tight">Evacuation &amp; Charge</h1>
      <EvacuationChargePanel
        system={system}
        evacuation={evacuation}
        charge={charge}
        calcLines={calcLines}
        rates={rates}
        hasFinalPhoto={hasFinalPhoto}
      />
      <LinkButton href={`/projects/${projectId}/ac/${systemId}`} size="lg" className="mt-6 w-full">
        Done — back to {system.system_ref}
      </LinkButton>
    </div>
  );
}
