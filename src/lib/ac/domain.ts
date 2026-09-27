import type { AcChargeRate, AcSystemStatus, AcSystemType, AcUnit } from "./types";

// ---------------------------------------------------------------------------
// System types — only "split" has a full workflow in V1. The others exist so
// the data model doesn't need restructuring when they're built later.
// ---------------------------------------------------------------------------
export const AC_SYSTEM_TYPE_META: Record<AcSystemType, { label: string; available: boolean }> = {
  split: { label: "Split", available: true },
  twin_split: { label: "Twin Split", available: false },
  triple_split: { label: "Triple Split", available: false },
  quad_split: { label: "Quad Split", available: false },
  vrf: { label: "VRF / VRV", available: false },
  other: { label: "Other", available: false },
};

// ---------------------------------------------------------------------------
// Manufacturers — the list is not locked; "Other" always escapes to free text.
// ---------------------------------------------------------------------------
export const MANUFACTURER_OPTIONS = [
  "Mitsubishi Electric",
  "Daikin",
  "Samsung",
  "Panasonic",
  "Other",
] as const;

// ---------------------------------------------------------------------------
// Refrigerants — GWP values are configured here, not buried in forms. "Other"
// always escapes to a free-text type + manually entered GWP.
// ---------------------------------------------------------------------------
export const REFRIGERANT_OPTIONS: { code: string; label: string; gwp: number | null }[] = [
  { code: "R32", label: "R32", gwp: 675 },
  { code: "R410A", label: "R410A", gwp: 2088 },
  { code: "Other", label: "Other", gwp: null },
];

export function gwpForRefrigerant(code: string): number | null {
  return REFRIGERANT_OPTIONS.find((r) => r.code === code)?.gwp ?? null;
}

export function refrigerantLabel(system: { refrigerant_code: string; refrigerant_other: string | null }): string {
  if (system.refrigerant_code === "Other") return system.refrigerant_other?.trim() || "Other";
  return system.refrigerant_code;
}

export function manufacturerLabel(system: { manufacturer: string; manufacturer_other: string | null }): string {
  if (system.manufacturer === "Other") return system.manufacturer_other?.trim() || "Other";
  return system.manufacturer;
}

/** Tonnes CO2 equivalent = total installed charge (kg) x GWP / 1000. */
export function tonnesCo2e(totalChargeKg: number, gwp: number): number {
  return (totalChargeKg * gwp) / 1000;
}

// ---------------------------------------------------------------------------
// Status presentation — same visual language as TEST_STATUS_META.
// ---------------------------------------------------------------------------
export const AC_SYSTEM_STATUS_META: Record<AcSystemStatus, { label: string; tone: "pass" | "progress" | "void" }> = {
  in_progress: { label: "In Progress", tone: "progress" },
  complete: { label: "Complete", tone: "pass" },
  void: { label: "Void", tone: "void" },
};

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------
export function outdoorUnit(units: AcUnit[]): AcUnit | undefined {
  return units.find((u) => u.unit_role === "outdoor");
}
export function indoorUnits(units: AcUnit[]): AcUnit[] {
  return units.filter((u) => u.unit_role === "indoor").sort((a, b) => a.unit_index - b.unit_index);
}
export function unitIdentified(unit: AcUnit | undefined): boolean {
  return !!unit?.model_number && !!unit?.serial_number;
}

// ---------------------------------------------------------------------------
// Evacuation — a fixed checklist for V1. Not hard-coded into the component
// markup, so it can move to a configurable table later without a rewrite.
// ---------------------------------------------------------------------------
export const EVACUATION_CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: "vacuum_pump_connected", label: "Vacuum pump connected to the system" },
  { key: "evacuated_to_target", label: "System evacuated to target vacuum" },
  { key: "vacuum_held", label: "Vacuum held — no rise on the decay test" },
];

// ---------------------------------------------------------------------------
// Refrigerant charge — pipe sizes for the additional-charge calculator. No
// per-metre rates are invented here; ac_charge_rates supplies those once
// real manufacturer figures are populated, and the engineer can always
// override manually in the meantime.
// ---------------------------------------------------------------------------
export const PIPE_SIZES = [
  '1/4"', '3/8"', '1/2"', '5/8"', '3/4"', '7/8"', '1 1/8"', '1 3/8"', '1 5/8"',
] as const;

/** Most-specific matching rate for a pipe size, or null if none is configured yet. */
export function chargeRateFor(
  rates: AcChargeRate[],
  pipeSize: string,
  manufacturer: string,
  refrigerantCode: string,
): number | null {
  const candidates = rates.filter((r) => r.pipe_size === pipeSize);
  const score = (r: AcChargeRate) =>
    (r.manufacturer === manufacturer ? 2 : 0) + (r.refrigerant_code === refrigerantCode ? 1 : 0);
  const withRate = candidates.filter((r) => r.kg_per_m !== null);
  if (withRate.length === 0) return null;
  withRate.sort((a, b) => score(b) - score(a));
  return withRate[0].kg_per_m;
}
