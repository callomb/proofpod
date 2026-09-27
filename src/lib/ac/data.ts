import "server-only";

import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import type {
  AcAuditEvent,
  AcCertificate,
  AcCharge,
  AcChargeCalcLine,
  AcChargeRate,
  AcCommissioning,
  AcDrainTest,
  AcEvacuation,
  AcPhoto,
  AcPressureTest,
  AcProjectSettings,
  AcSystem,
  AcTemperatureReading,
  AcUnit,
} from "./types";

export async function listProjectAcSystems(projectId: string): Promise<AcSystem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ac_systems")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return (data ?? []) as AcSystem[];
}

export async function getAcSystem(id: string): Promise<AcSystem | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("ac_systems").select("*").eq("id", id).maybeSingle<AcSystem>();
  return data;
}

export async function listAcUnits(acSystemId: string): Promise<AcUnit[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ac_units")
    .select("*")
    .eq("ac_system_id", acSystemId)
    .order("unit_role", { ascending: false })
    .order("unit_index", { ascending: true });
  return (data ?? []) as AcUnit[];
}

export async function getAcUnit(id: string): Promise<AcUnit | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("ac_units").select("*").eq("id", id).maybeSingle<AcUnit>();
  return data;
}

export async function listAcPressureTests(acSystemId: string): Promise<AcPressureTest[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ac_pressure_tests")
    .select("*")
    .eq("ac_system_id", acSystemId)
    .order("attempt_no", { ascending: false });
  return (data ?? []) as AcPressureTest[];
}

/** All attempts sharing one lineage (an original attempt + its retests). */
export async function listAcPressureTestsByLineage(lineageId: string): Promise<AcPressureTest[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ac_pressure_tests")
    .select("*")
    .eq("lineage_id", lineageId)
    .order("attempt_no", { ascending: false });
  return (data ?? []) as AcPressureTest[];
}

export async function getAcPressureTest(id: string): Promise<AcPressureTest | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ac_pressure_tests")
    .select("*")
    .eq("id", id)
    .maybeSingle<AcPressureTest>();
  return data;
}

/** One row per standalone (no-system) pressure test lineage on a project — the latest attempt in each. */
export async function listStandaloneAcPressureTests(projectId: string): Promise<AcPressureTest[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ac_pressure_tests")
    .select("*")
    .eq("project_id", projectId)
    .is("ac_system_id", null)
    .order("attempt_no", { ascending: false });
  const rows = (data ?? []) as AcPressureTest[];
  const seen = new Set<string>();
  const latestPerLineage: AcPressureTest[] = [];
  for (const row of rows) {
    if (seen.has(row.lineage_id)) continue;
    seen.add(row.lineage_id);
    latestPerLineage.push(row);
  }
  return latestPerLineage;
}

export async function getAcEvacuation(acSystemId: string): Promise<AcEvacuation | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ac_evacuations")
    .select("*")
    .eq("ac_system_id", acSystemId)
    .maybeSingle<AcEvacuation>();
  return data;
}

export async function getAcCharge(acSystemId: string): Promise<AcCharge | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ac_charges")
    .select("*")
    .eq("ac_system_id", acSystemId)
    .maybeSingle<AcCharge>();
  return data;
}

export async function listAcChargeCalcLines(acSystemId: string): Promise<AcChargeCalcLine[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ac_charge_calc_lines")
    .select("*")
    .eq("ac_system_id", acSystemId);
  return (data ?? []) as AcChargeCalcLine[];
}

export async function listAcChargeRates(): Promise<AcChargeRate[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("ac_charge_rates").select("*");
  return (data ?? []) as AcChargeRate[];
}

export async function getAcCommissioning(acSystemId: string): Promise<AcCommissioning | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ac_commissioning")
    .select("*")
    .eq("ac_system_id", acSystemId)
    .maybeSingle<AcCommissioning>();
  return data;
}

export async function listAcTemperatureReadings(acSystemId: string): Promise<AcTemperatureReading[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ac_temperature_readings")
    .select("*")
    .eq("ac_system_id", acSystemId);
  return (data ?? []) as AcTemperatureReading[];
}

export async function listAcDrainTests(acSystemId: string): Promise<AcDrainTest[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ac_drain_tests")
    .select("*")
    .eq("ac_system_id", acSystemId)
    .order("tested_at", { ascending: false });
  return (data ?? []) as AcDrainTest[];
}

export async function listAcPhotosForPressureTests(pressureTestIds: string[]): Promise<AcPhoto[]> {
  if (pressureTestIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("ac_photos").select("*").in("ac_pressure_test_id", pressureTestIds);
  return (data ?? []) as AcPhoto[];
}

export async function listAcPhotos(acSystemId: string): Promise<AcPhoto[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ac_photos")
    .select("*")
    .eq("ac_system_id", acSystemId)
    .order("taken_at", { ascending: true });
  return (data ?? []) as AcPhoto[];
}

export async function listAcAudit(acSystemId: string): Promise<AcAuditEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ac_audit_events")
    .select("*")
    .eq("ac_system_id", acSystemId)
    .order("created_at", { ascending: true });
  return (data ?? []) as AcAuditEvent[];
}

export async function getAcProjectSettings(projectId: string): Promise<AcProjectSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ac_project_settings")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle<AcProjectSettings>();
  return data;
}

export async function listProjectAcCertificates(projectId: string): Promise<AcCertificate[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ac_certificates")
    .select("*")
    .eq("project_id", projectId)
    .order("issued_at", { ascending: false });
  return (data ?? []) as AcCertificate[];
}

export async function getAcCertificate(id: string): Promise<AcCertificate | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ac_certificates")
    .select("*")
    .eq("id", id)
    .maybeSingle<AcCertificate>();
  return data;
}

/** Signed URLs for AC evidence photos — same `evidence` bucket as plumbing. */
export async function signAcEvidenceUrls(
  paths: string[],
  expiresIn = 60 * 60,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const admin = createAdminClient();
  const { data } = await admin.storage.from("evidence").createSignedUrls(paths, expiresIn);
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}
