"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { extractDataPlate } from "./vision";
import type { AcPhotoSubject } from "./types";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

// ===========================================================================
// System creation
// ===========================================================================
export async function createAcSystemAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const projectId = String(formData.get("project_id") || "");
  const redirectBase = String(formData.get("redirect_base") || "/projects");
  const systemRef = String(formData.get("system_ref") || "").trim();
  const areaServed = String(formData.get("area_served") || "").trim();
  const outdoorLocation = String(formData.get("outdoor_location") || "").trim();
  const manufacturer = String(formData.get("manufacturer") || "").trim();
  const manufacturerOther = String(formData.get("manufacturer_other") || "").trim();
  const refrigerantCode = String(formData.get("refrigerant_code") || "").trim();
  const refrigerantOther = String(formData.get("refrigerant_other") || "").trim();
  const gwp = Number(formData.get("gwp") || 0);

  if (!systemRef) return { error: "Enter a system reference." };
  if (!areaServed) return { error: "Enter the area served." };
  if (!outdoorLocation) return { error: "Enter the outdoor unit location." };
  if (manufacturer === "Other" && !manufacturerOther) return { error: "Name the manufacturer." };
  if (refrigerantCode === "Other" && !refrigerantOther) return { error: "Name the refrigerant." };
  if (refrigerantCode === "Other" && !gwp) return { error: "Enter the refrigerant's GWP." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_ac_system", {
      p_project_id: projectId,
      p_system_ref: systemRef,
      p_area_served: areaServed,
      p_outdoor_location: outdoorLocation,
      p_manufacturer: manufacturer,
      p_manufacturer_other: manufacturerOther || null,
      p_refrigerant_code: refrigerantCode,
      p_refrigerant_other: refrigerantOther || null,
      p_gwp: gwp,
    })
    .select()
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  redirect(`${redirectBase}/${projectId}/ac/${(data as { id: string }).id}`);
}

// ===========================================================================
// Units
// ===========================================================================
export async function updateAcUnitAction(input: {
  unitId: string;
  reference?: string | null;
  location?: string | null;
  assetNumber?: string | null;
  modelNumber?: string | null;
  serialNumber?: string | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_ac_unit", {
    p_unit_id: input.unitId,
    p_reference: input.reference ?? null,
    p_location: input.location ?? null,
    p_asset_number: input.assetNumber ?? null,
    p_model_number: input.modelNumber ?? null,
    p_serial_number: input.serialNumber ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveAcUnitOcrAction(
  unitId: string,
  ocr: Record<string, unknown>,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_ac_unit_ocr", { p_unit_id: unitId, p_ocr: ocr });
  if (error) return { error: error.message };
  return { ok: true };
}

export interface ExtractResult extends ActionResult {
  model?: string | null;
  serial?: string | null;
}

/**
 * Reads a data-plate photo already uploaded to the `evidence` bucket and asks
 * Claude to suggest the model/serial number. Suggestion only — the caller
 * must still confirm/correct it via updateAcUnitAction before it's saved as
 * the unit's model/serial number.
 */
export async function extractDataPlateAction(
  unitId: string,
  storagePath: string,
  mime: string,
): Promise<ExtractResult> {
  const supabase = await createClient();
  const { data: unit } = await supabase
    .from("ac_units")
    .select("id")
    .eq("id", unitId)
    .maybeSingle();
  if (!unit) return { error: "Unit not found" };

  const supportedTypes = ["image/jpeg", "image/png", "image/webp"] as const;
  type SupportedMediaType = (typeof supportedTypes)[number];
  if (!supportedTypes.includes(mime as SupportedMediaType)) {
    // e.g. HEIC — not something the vision model accepts. The photo is
    // already saved; the engineer just enters model/serial manually.
    return { ok: true, model: null, serial: null };
  }

  const admin = createAdminClient();
  const { data: file, error: dlError } = await admin.storage.from("evidence").download(storagePath);
  if (dlError || !file) return { error: "Could not read the photo." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  const result = await extractDataPlate(base64, mime as SupportedMediaType);

  await supabase.rpc("save_ac_unit_ocr", {
    p_unit_id: unitId,
    p_ocr: { model: result.model, serial: result.serial, raw: result.raw, ranAt: new Date().toISOString() },
  });

  return { ok: true, model: result.model, serial: result.serial };
}

// ===========================================================================
// Pressure test attempts
// ===========================================================================
export interface AttemptResult extends ActionResult {
  id?: string;
}

export async function createAcPressureTestAttemptAction(
  acSystemId: string,
  retestOf?: string | null,
): Promise<AttemptResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_ac_pressure_test_attempt", {
      p_ac_system_id: acSystemId,
      p_retest_of: retestOf ?? null,
    })
    .select()
    .single();
  if (error) return { error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

export async function startAcPressureTestAttemptAction(input: {
  attemptId: string;
  startPressureBar: number;
  notes?: string | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_ac_pressure_test_attempt", {
    p_attempt_id: input.attemptId,
    p_start_pressure_bar: input.startPressureBar,
    p_notes: input.notes ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function completeAcPressureTestAttemptAction(input: {
  attemptId: string;
  endPressureBar: number;
  testDurationMin: number;
  notes?: string | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_ac_pressure_test_attempt", {
    p_attempt_id: input.attemptId,
    p_end_pressure_bar: input.endPressureBar,
    p_test_duration_min: input.testDurationMin,
    p_notes: input.notes ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setAcPressureTestResultAction(
  attemptId: string,
  result: "passed" | "failed",
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_ac_pressure_test_result", {
    p_attempt_id: attemptId,
    p_result: result,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ===========================================================================
// Evacuation
// ===========================================================================
export async function saveAcEvacuationChecklistAction(
  acSystemId: string,
  checklist: Record<string, boolean>,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_ac_evacuation_checklist", {
    p_ac_system_id: acSystemId,
    p_checklist: checklist,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function completeAcEvacuationAction(acSystemId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_ac_evacuation", { p_ac_system_id: acSystemId });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ===========================================================================
// Refrigerant charge
// ===========================================================================
export async function updateAcChargeAction(input: {
  acSystemId: string;
  factoryChargeKg?: number | null;
  factoryPipeAllowanceM?: number | null;
  installedPipeLengthM?: number | null;
  additionalMethod?: "manual" | "calculated" | null;
  actualAdditionalKg?: number | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_ac_charge", {
    p_ac_system_id: input.acSystemId,
    p_factory_charge_kg: input.factoryChargeKg ?? null,
    p_factory_pipe_allowance_m: input.factoryPipeAllowanceM ?? null,
    p_installed_pipe_length_m: input.installedPipeLengthM ?? null,
    p_additional_method: input.additionalMethod ?? null,
    p_actual_additional_kg: input.actualAdditionalKg ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function upsertAcChargeCalcLineAction(input: {
  acSystemId: string;
  pipeSize: string;
  lengthM: number;
  rateKgPerM: number | null;
  overridden?: boolean;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_ac_charge_calc_line", {
    p_ac_system_id: input.acSystemId,
    p_pipe_size: input.pipeSize,
    p_length_m: input.lengthM,
    p_rate_kg_per_m: input.rateKgPerM,
    p_overridden: input.overridden ?? false,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ===========================================================================
// Commissioning
// ===========================================================================
export async function updateAcCommissioningAction(
  acSystemId: string,
  fields: Partial<{
    transitBracketsRemoved: boolean;
    electricalConnectionsTight: boolean;
    localIsolatorFitted: boolean;
    equipmentLabelled: boolean;
    coversFixedClean: boolean;
    functionalTestSatisfactory: boolean;
    mcbFuseSpec: string;
    outdoorNameplateFlcAmps: number;
    suctionPipeSize: string;
    liquidPipeSize: string;
    currentCoolingL1: number;
    currentCoolingL2: number;
    currentCoolingL3: number;
    currentHeatingL1: number;
    currentHeatingL2: number;
    currentHeatingL3: number;
  }>,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_ac_commissioning", {
    p_ac_system_id: acSystemId,
    p_transit_brackets_removed: fields.transitBracketsRemoved ?? null,
    p_electrical_connections_tight: fields.electricalConnectionsTight ?? null,
    p_local_isolator_fitted: fields.localIsolatorFitted ?? null,
    p_equipment_labelled: fields.equipmentLabelled ?? null,
    p_covers_fixed_clean: fields.coversFixedClean ?? null,
    p_functional_test_satisfactory: fields.functionalTestSatisfactory ?? null,
    p_mcb_fuse_spec: fields.mcbFuseSpec ?? null,
    p_outdoor_nameplate_flc_amps: fields.outdoorNameplateFlcAmps ?? null,
    p_suction_pipe_size: fields.suctionPipeSize ?? null,
    p_liquid_pipe_size: fields.liquidPipeSize ?? null,
    p_current_cooling_l1: fields.currentCoolingL1 ?? null,
    p_current_cooling_l2: fields.currentCoolingL2 ?? null,
    p_current_cooling_l3: fields.currentCoolingL3 ?? null,
    p_current_heating_l1: fields.currentHeatingL1 ?? null,
    p_current_heating_l2: fields.currentHeatingL2 ?? null,
    p_current_heating_l3: fields.currentHeatingL3 ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function upsertAcTemperatureReadingAction(input: {
  acUnitId: string;
  mode: "cooling" | "heating";
  airOnC?: number | null;
  airOffC?: number | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_ac_temperature_reading", {
    p_ac_unit_id: input.acUnitId,
    p_mode: input.mode,
    p_air_on_c: input.airOnC ?? null,
    p_air_off_c: input.airOffC ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ===========================================================================
// Drain test
// ===========================================================================
export async function createAcDrainTestAction(input: {
  acUnitId: string;
  drainType: "pump" | "gravity";
  result: "passed" | "failed";
  pumpModel?: string | null;
  waterAddedLitres?: number | null;
  notes?: string | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_ac_drain_test", {
    p_ac_unit_id: input.acUnitId,
    p_drain_type: input.drainType,
    p_result: input.result,
    p_pump_model: input.pumpModel ?? null,
    p_water_added_litres: input.waterAddedLitres ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ===========================================================================
// System completion
// ===========================================================================
export async function completeAcSystemAction(acSystemId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_ac_system", { p_ac_system_id: acSystemId });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ===========================================================================
// Evidence photos
// ===========================================================================
export async function recordAcPhotoAction(input: {
  acSystemId: string;
  storagePath: string;
  subject: AcPhotoSubject;
  acUnitId?: string | null;
  acPressureTestId?: string | null;
  mime?: string | null;
  sizeBytes?: number | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_ac_photo", {
    p_ac_system_id: input.acSystemId,
    p_subject: input.subject,
    p_storage_path: input.storagePath,
    p_ac_unit_id: input.acUnitId ?? null,
    p_ac_pressure_test_id: input.acPressureTestId ?? null,
    p_mime: input.mime ?? null,
    p_size_bytes: input.sizeBytes ?? null,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

// ===========================================================================
// Void
// ===========================================================================
export async function voidAcSystemAction(
  acSystemId: string,
  reason?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_ac_system", {
    p_ac_system_id: acSystemId,
    p_reason: reason ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
