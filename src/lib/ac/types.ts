// Hand-maintained types mirroring supabase/migrations/0008_ac_systems.sql
// (and later ac_* migrations). Fully independent of src/lib/types.ts.

export type AcSystemType =
  | "split"
  | "twin_split"
  | "triple_split"
  | "quad_split"
  | "vrf"
  | "other";
export type AcSystemStatus = "in_progress" | "complete" | "void";
export type AcUnitRole = "outdoor" | "indoor";
export type AcPhotoSubject =
  | "pressure_start"
  | "pressure_end"
  | "evacuation_final"
  | "outdoor_data_plate"
  | "indoor_data_plate";

export interface AcSystem {
  id: string;
  company_id: string;
  project_id: string;
  ref: string;
  system_type: AcSystemType;
  system_ref: string;
  area_served: string;
  outdoor_location: string;
  manufacturer: string;
  manufacturer_other: string | null;
  refrigerant_code: string;
  refrigerant_other: string | null;
  gwp: number;
  status: AcSystemStatus;
  locked: boolean;
  completed_at: string | null;
  completed_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface AcUnit {
  id: string;
  company_id: string;
  ac_system_id: string;
  unit_role: AcUnitRole;
  unit_index: number;
  reference: string | null;
  location: string | null;
  asset_number: string | null;
  model_number: string | null;
  serial_number: string | null;
  ocr_extracted: { model?: string; serial?: string; raw?: string; ranAt?: string } | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AcPhoto {
  id: string;
  company_id: string;
  project_id: string;
  ac_system_id: string | null;
  ac_unit_id: string | null;
  ac_pressure_test_id: string | null;
  stage_no: number | null;
  subject: AcPhotoSubject;
  storage_path: string;
  mime: string | null;
  size_bytes: number | null;
  taken_at: string;
  taken_by: string;
  created_at: string;
}

export type AcPressureTestStatus = "in_progress" | "passed" | "failed";

export interface AcPressureTest {
  id: string;
  company_id: string;
  ac_system_id: string | null;
  project_id: string;
  reference: string | null;
  ref: string;
  lineage_id: string;
  attempt_no: number;
  retest_of: string | null;
  status: AcPressureTestStatus;
  locked: boolean;
  start_pressure_bar: number | null;
  test_duration_min: number | null;
  end_pressure_bar: number | null;
  notes: string | null;
  started_at: string | null;
  started_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  result_at: string | null;
  result_by: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface AcEvacuation {
  id: string;
  company_id: string;
  ac_system_id: string;
  checklist: Record<string, boolean>;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export type AcChargeMethod = "manual" | "calculated";

export interface AcCharge {
  id: string;
  company_id: string;
  ac_system_id: string;
  factory_charge_kg: number | null;
  factory_pipe_allowance_m: number | null;
  installed_pipe_length_m: number | null;
  additional_method: AcChargeMethod;
  actual_additional_kg: number | null;
  calculated_additional_kg: number;
  total_charge_kg: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface AcChargeCalcLine {
  id: string;
  company_id: string;
  ac_system_id: string;
  pipe_size: string;
  length_m: number;
  rate_kg_per_m: number | null;
  overridden: boolean;
  calculated_kg: number;
  created_at: string;
  updated_at: string;
}

export interface AcChargeRate {
  id: string;
  pipe_size: string;
  manufacturer: string | null;
  refrigerant_code: string | null;
  model: string | null;
  kg_per_m: number | null;
}

export interface AcCommissioning {
  id: string;
  company_id: string;
  ac_system_id: string;
  transit_brackets_removed: boolean | null;
  electrical_connections_tight: boolean | null;
  local_isolator_fitted: boolean | null;
  equipment_labelled: boolean | null;
  covers_fixed_clean: boolean | null;
  functional_test_satisfactory: boolean | null;
  mcb_fuse_spec: string | null;
  outdoor_nameplate_flc_amps: number | null;
  suction_pipe_size: string | null;
  liquid_pipe_size: string | null;
  current_cooling_l1: number | null;
  current_cooling_l2: number | null;
  current_cooling_l3: number | null;
  current_heating_l1: number | null;
  current_heating_l2: number | null;
  current_heating_l3: number | null;
  created_at: string;
  updated_at: string;
}

export type AcTempMode = "cooling" | "heating";

export interface AcTemperatureReading {
  id: string;
  company_id: string;
  ac_system_id: string;
  ac_unit_id: string;
  mode: AcTempMode;
  air_on_c: number | null;
  air_off_c: number | null;
  recorded_at: string | null;
  recorded_by: string | null;
  updated_at: string;
}

export type AcDrainType = "pump" | "gravity";
export type AcDrainResult = "passed" | "failed";

export interface AcDrainTest {
  id: string;
  company_id: string;
  ac_system_id: string;
  ac_unit_id: string;
  drain_type: AcDrainType;
  pump_model: string | null;
  water_added_litres: number | null;
  result: AcDrainResult;
  notes: string | null;
  tested_at: string;
  tested_by: string;
  created_at: string;
}

export interface AcProjectSettings {
  project_id: string;
  company_id: string;
  plant_operator: string | null;
  operator_contact: string | null;
  created_at: string;
  updated_at: string;
}

export type AcDocType =
  | "pressure_test"
  | "commissioning"
  | "drain_test"
  | "fgas_log"
  | "fgas_inventory"
  | "full";

export interface AcCertificateSnapshot {
  company: {
    name: string;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    postcode: string | null;
    phone: string | null;
    logo_path: string | null;
  };
  project: {
    name: string;
    project_number: string | null;
    client_name: string | null;
    site_address: string | null;
    plant_operator: string | null;
    operator_contact: string | null;
  };
  system: {
    ref: string;
    system_ref: string;
    system_type: AcSystemType;
    area_served: string;
    outdoor_location: string;
    manufacturer: string;
    refrigerant: string;
    gwp: number;
  };
  units: {
    id?: string;
    unit_role: AcUnitRole;
    reference: string | null;
    location: string | null;
    asset_number: string | null;
    model_number: string | null;
    serial_number: string | null;
  }[];
  pressure_test: {
    attempt_no: number;
    status: AcPressureTestStatus;
    result_at: string | null;
    stages: {
      stage_no: number;
      target_pressure_bar: number;
      target_duration_min: number | null;
      requires_photo: boolean;
      status: AcPressureStageStatus;
      started_at: string | null;
      completed_at: string | null;
      photos: { subject: string; storage_path: string; taken_at: string; taken_by_name?: string | null }[] | null;
    }[];
  } | null;
  evacuation: {
    checklist: Record<string, boolean>;
    completed_at: string | null;
    photo: { storage_path: string; taken_at: string; taken_by_name?: string | null } | null;
  } | null;
  charge: {
    factory_charge_kg: number | null;
    factory_pipe_allowance_m: number | null;
    installed_pipe_length_m: number | null;
    actual_additional_kg: number | null;
    total_charge_kg: number;
    gwp: number;
    tonnes_co2e: number;
  } | null;
  commissioning: {
    transit_brackets_removed: boolean | null;
    electrical_connections_tight: boolean | null;
    local_isolator_fitted: boolean | null;
    equipment_labelled: boolean | null;
    covers_fixed_clean: boolean | null;
    functional_test_satisfactory: boolean | null;
    mcb_fuse_spec: string | null;
    outdoor_nameplate_flc_amps: number | null;
    suction_pipe_size: string | null;
    liquid_pipe_size: string | null;
    current_cooling: (number | null)[];
    current_heating: (number | null)[];
  } | null;
  temperatures: {
    ac_unit_id: string;
    mode: AcTempMode;
    air_on_c: number | null;
    air_off_c: number | null;
    recorded_at: string | null;
  }[];
  drain_tests: {
    ac_unit_id: string;
    drain_type: AcDrainType;
    pump_model: string | null;
    water_added_litres: number | null;
    result: AcDrainResult;
    tested_at: string;
  }[];
  completed_at: string | null;
  completed_by_name?: string | null;
  issued_at: string;
}

export interface AcCertificate {
  id: string;
  company_id: string;
  project_id: string;
  ac_system_id: string;
  doc_type: AcDocType;
  number: string;
  snapshot: AcCertificateSnapshot;
  pdf_path: string | null;
  issued_by: string | null;
  issued_at: string;
  created_at: string;
}

export type AcPressureStageStatus = "not_started" | "in_progress" | "complete";

export interface AcPressureTestStage {
  id: string;
  company_id: string;
  ac_pressure_test_id: string;
  stage_no: number;
  target_pressure_bar: number;
  target_duration_min: number | null;
  requires_photo: boolean;
  status: AcPressureStageStatus;
  started_at: string | null;
  started_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AcAuditEvent {
  id: string;
  company_id: string;
  actor_id: string | null;
  project_id: string | null;
  ac_system_id: string | null;
  event_type: string;
  data: Record<string, unknown>;
  created_at: string;
}
