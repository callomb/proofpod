import { notFound } from "next/navigation";

import { DrainTestPanel } from "@/components/ac/drain-test-panel";
import { BackLink, LinkButton } from "@/components/ui";
import { getAcSystem, listAcDrainTests, listAcUnits } from "@/lib/ac/data";
import { indoorUnits } from "@/lib/ac/domain";
import { getWorkspace } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AcDrainTestPage(
  props: PageProps<"/projects/[projectId]/ac/[systemId]/drain-test">,
) {
  const { projectId, systemId } = await props.params;
  const [system, { memberNames }] = await Promise.all([getAcSystem(systemId), getWorkspace()]);
  if (!system || system.project_id !== projectId) notFound();

  const [units, drainTests] = await Promise.all([listAcUnits(systemId), listAcDrainTests(systemId)]);

  return (
    <div>
      <div className="mb-3">
        <BackLink href={`/projects/${projectId}/ac/${systemId}`}>{system.system_ref}</BackLink>
      </div>
      <h1 className="mb-5 text-[24px] font-semibold tracking-tight">Drain Test</h1>
      <DrainTestPanel units={indoorUnits(units)} drainTests={drainTests} memberNames={memberNames} />
      <LinkButton href={`/projects/${projectId}/ac/${systemId}`} size="lg" className="mt-6 w-full">
        Done — back to {system.system_ref}
      </LinkButton>
    </div>
  );
}
