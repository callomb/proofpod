import { indoorUnits, outdoorUnit, unitIdentified } from "./domain";
import type {
  AcCharge,
  AcCommissioning,
  AcDrainTest,
  AcEvacuation,
  AcPressureTest,
  AcSystem,
  AcTemperatureReading,
  AcUnit,
} from "./types";

export interface CompletionItem {
  label: string;
  href: string;
}

export interface CompletionSummary {
  complete: boolean;
  missing: CompletionItem[];
}

/**
 * What's missing before a system can be marked complete. Mirrors
 * complete_ac_system's server-side checks so the UI and the RPC never
 * disagree — this only checks that data was CAPTURED, never that a reading
 * is "good": a failed drain test or a low temperature delta doesn't block
 * completion, only a missing one does.
 */
export function acSystemCompletion(input: {
  projectId: string;
  system: AcSystem;
  units: AcUnit[];
  pressureTests: AcPressureTest[];
  evacuation: AcEvacuation | null;
  charge: AcCharge | null;
  commissioning: AcCommissioning | null;
  temperatureReadings: AcTemperatureReading[];
  drainTests: AcDrainTest[];
}): CompletionSummary {
  const { projectId, system, units, pressureTests, evacuation, charge, commissioning, temperatureReadings, drainTests } =
    input;
  const base = `/projects/${projectId}/ac/${system.id}`;
  const missing: CompletionItem[] = [];

  const outdoor = outdoorUnit(units);
  if (!unitIdentified(outdoor)) {
    missing.push({ label: "Outdoor unit identification", href: `${base}/units/${outdoor?.id ?? ""}` });
  }

  for (const unit of indoorUnits(units)) {
    const label = unit.reference || "Indoor unit";
    if (!unitIdentified(unit)) {
      missing.push({ label: `${label} identification`, href: `${base}/units/${unit.id}` });
    }
    const cooling = temperatureReadings.find((r) => r.ac_unit_id === unit.id && r.mode === "cooling");
    const heating = temperatureReadings.find((r) => r.ac_unit_id === unit.id && r.mode === "heating");
    if (!cooling || cooling.air_on_c === null || cooling.air_off_c === null) {
      missing.push({ label: `${label} cooling temperatures`, href: `${base}/commissioning` });
    }
    if (!heating || heating.air_on_c === null || heating.air_off_c === null) {
      missing.push({ label: `${label} heating temperatures`, href: `${base}/commissioning` });
    }
    if (!drainTests.some((d) => d.ac_unit_id === unit.id)) {
      missing.push({ label: `${label} drain test`, href: `${base}/drain-test` });
    }
  }

  const latestPressureTest = pressureTests[0];
  if (!latestPressureTest || latestPressureTest.status !== "passed") {
    missing.push({ label: "Pressure test (passed)", href: `${base}/pressure-test` });
  }

  if (!evacuation?.completed_at) {
    missing.push({ label: "Evacuation", href: `${base}/evacuation-charge` });
  }

  if (!charge || charge.factory_charge_kg === null || charge.actual_additional_kg === null) {
    missing.push({
      label: "Refrigerant charge (factory charge, and additional added — 0 if none)",
      href: `${base}/evacuation-charge`,
    });
  }

  const c = commissioning;
  const commissioningDone =
    c &&
    c.transit_brackets_removed !== null &&
    c.electrical_connections_tight !== null &&
    c.local_isolator_fitted !== null &&
    c.equipment_labelled !== null &&
    c.covers_fixed_clean !== null &&
    c.functional_test_satisfactory !== null &&
    c.mcb_fuse_spec !== null &&
    c.outdoor_nameplate_flc_amps !== null &&
    c.suction_pipe_size !== null &&
    c.liquid_pipe_size !== null;
  if (!commissioningDone) {
    missing.push({ label: "Commissioning checks", href: `${base}/commissioning` });
  }

  return { complete: missing.length === 0, missing };
}
