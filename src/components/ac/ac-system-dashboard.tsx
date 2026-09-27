import Link from "next/link";

import {
  AC_SYSTEM_STATUS_META,
  indoorUnits,
  manufacturerLabel,
  outdoorUnit,
  refrigerantLabel,
  unitIdentified,
} from "@/lib/ac/domain";
import type { CompletionSummary } from "@/lib/ac/completion";
import type { AcDrainTest, AcEvacuation, AcPressureTest, AcSystem, AcUnit } from "@/lib/ac/types";
import { BackLink, Card, StatusDot } from "../ui";
import { CompleteSystemButton } from "./complete-system-button";
import { VoidSystemButton } from "./void-system-button";

type Tone = "pass" | "progress" | "fail" | "void";

function LinkRow({
  href,
  title,
  hint,
  status,
  tone,
}: {
  href: string;
  title: string;
  hint: string;
  status: string;
  tone: Tone;
}) {
  return (
    <Link href={href}>
      <Card className="flex items-center justify-between p-4">
        <div className="min-w-0">
          <p className="text-[14px] font-medium">{title}</p>
          <p className="mt-0.5 text-[12px] text-muted">{hint}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
          <StatusDot tone={tone} />
          {status}
        </span>
      </Card>
    </Link>
  );
}

function pressureTestStatus(latest: AcPressureTest | undefined): { label: string; tone: Tone } {
  if (!latest) return { label: "Not started", tone: "void" };
  if (latest.status === "passed") return { label: "Passed", tone: "pass" };
  if (latest.status === "failed") return { label: "Failed — retest", tone: "fail" };
  return { label: "In progress", tone: "progress" };
}

function evacuationStatus(evacuation: AcEvacuation | null): { label: string; tone: Tone } {
  if (!evacuation) return { label: "Not started", tone: "void" };
  if (evacuation.completed_at) return { label: "Complete", tone: "pass" };
  const started = Object.values(evacuation.checklist ?? {}).some(Boolean);
  return started ? { label: "In progress", tone: "progress" } : { label: "Not started", tone: "void" };
}

function drainTestStatus(units: AcUnit[], drainTests: AcDrainTest[]): { label: string; tone: Tone } {
  const indoors = indoorUnits(units);
  if (indoors.length === 0) return { label: "Not started", tone: "void" };
  const tested = indoors.filter((u) => drainTests.some((d) => d.ac_unit_id === u.id));
  if (tested.length === 0) return { label: "Not started", tone: "void" };
  if (tested.length < indoors.length) return { label: "In progress", tone: "progress" };
  const allPassed = indoors.every((u) => drainTests.find((d) => d.ac_unit_id === u.id)?.result === "passed");
  return allPassed ? { label: "Passed", tone: "pass" } : { label: "Recorded — check failures", tone: "fail" };
}

function UnitRow({ projectId, system, unit, title }: { projectId: string; system: AcSystem; unit: AcUnit; title: string }) {
  const identified = unitIdentified(unit);
  return (
    <Link href={`/projects/${projectId}/ac/${system.id}/units/${unit.id}`}>
      <Card className="flex items-center justify-between p-4">
        <div className="min-w-0">
          <p className="text-[14px] font-medium">{title}</p>
          <p className="mt-0.5 truncate text-[12px] text-muted">
            {identified ? `${unit.model_number} · ${unit.serial_number}` : "Not identified yet"}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
          <StatusDot tone={identified ? "pass" : "progress"} />
          {identified ? "Identified" : "Identify"}
        </span>
      </Card>
    </Link>
  );
}

export function AcSystemDashboard({
  projectId,
  projectName,
  system,
  units,
  pressureTests,
  evacuation,
  drainTests,
  completion,
}: {
  projectId: string;
  projectName: string;
  system: AcSystem;
  units: AcUnit[];
  pressureTests: AcPressureTest[];
  evacuation: AcEvacuation | null;
  drainTests: AcDrainTest[];
  completion: CompletionSummary;
}) {
  const outdoor = outdoorUnit(units);
  const indoors = indoorUnits(units);
  const statusMeta = AC_SYSTEM_STATUS_META[system.status];
  const pressureStatus = pressureTestStatus(pressureTests[0]);
  const evacStatus = evacuationStatus(evacuation);
  const drainStatus = drainTestStatus(units, drainTests);
  const commissioningDone = !completion.missing.some((m) => m.href.endsWith("/commissioning"));

  return (
    <div>
      <div className="mb-3">
        <BackLink href={`/projects/${projectId}`}>{projectName}</BackLink>
      </div>

      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-[24px] font-semibold tracking-tight">{system.system_ref}</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-[12px] font-medium">
            <StatusDot tone={statusMeta.tone} />
            {statusMeta.label}
          </span>
        </div>
        <p className="mt-0.5 text-[13px] text-muted">
          {system.area_served} · {manufacturerLabel(system)} · {refrigerantLabel(system)}
        </p>
      </div>

      <div className="space-y-2.5">
        {outdoor ? <UnitRow projectId={projectId} system={system} unit={outdoor} title="Outdoor unit" /> : null}
        {indoors.map((unit, i) => (
          <UnitRow
            key={unit.id}
            projectId={projectId}
            system={system}
            unit={unit}
            title={indoors.length > 1 ? `Indoor unit ${i + 1}` : "Indoor unit"}
          />
        ))}
        <LinkRow
          href={`/projects/${projectId}/ac/${system.id}/pressure-test`}
          title="Pressure Test"
          hint="Refrigerant pipe leak test"
          status={pressureStatus.label}
          tone={pressureStatus.tone}
        />
        <LinkRow
          href={`/projects/${projectId}/ac/${system.id}/evacuation-charge`}
          title="Evacuation & Refrigerant Charge"
          hint="Vacuum, factory + additional charge"
          status={evacStatus.label}
          tone={evacStatus.tone}
        />
        <LinkRow
          href={`/projects/${projectId}/ac/${system.id}/commissioning`}
          title="Commissioning"
          hint="Installation checks, currents, temperatures"
          status={commissioningDone ? "Complete" : "In progress"}
          tone={commissioningDone ? "pass" : "progress"}
        />
        <LinkRow
          href={`/projects/${projectId}/ac/${system.id}/drain-test`}
          title="Drain Test"
          hint="Per indoor unit"
          status={drainStatus.label}
          tone={drainStatus.tone}
        />
      </div>

      {system.status === "in_progress" ? (
        <div className="mt-6">
          {completion.complete ? (
            <CompleteSystemButton acSystemId={system.id} systemRef={system.system_ref} />
          ) : (
            <Card className="p-4">
              <p className="mb-2 text-[14px] font-semibold">
                {completion.missing.length} item{completion.missing.length === 1 ? "" : "s"} remaining
              </p>
              <ul className="space-y-1.5">
                {completion.missing.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href} className="text-[13px] text-muted underline underline-offset-2">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <div className="mt-4 text-center">
            <VoidSystemButton acSystemId={system.id} systemRef={system.system_ref} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
