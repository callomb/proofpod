// Hand-maintained types mirroring supabase/migrations/0001_initial_schema.sql

export type ProjectStatus = "active" | "archived";
export type TestStatus = "in_progress" | "passed" | "failed" | "void";
export type StageKey = "initial" | "strength" | "pressure";
export type StageStatus = "not_started" | "in_progress" | "complete";
export type SystemKind = "cold" | "hot" | "boosted" | "heating" | "other";
export type PhotoKind = "start" | "end" | "other";
export type MemberRole = "owner" | "admin" | "member";

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  phone: string | null;
  logo_path: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
}

export interface CompanyInvite {
  id: string;
  company_id: string;
  email: string | null;
  role: MemberRole;
  token: string;
  invited_by: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
  expires_at: string;
}

export interface TestProfile {
  id: string;
  company_id: string;
  name: string;
  is_company_default: boolean;
  initial_pressure_bar: number;
  initial_duration_min: number;
  strength_pressure_bar: number;
  strength_duration_min: number;
  pressure_pressure_bar: number;
  pressure_duration_min: number;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface Project {
  id: string;
  company_id: string;
  name: string;
  project_number: string | null;
  client_name: string | null;
  site_address: string | null;
  status: ProjectStatus;
  test_profile_id: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  archived_at: string | null;
}

export interface ProjectOverview extends Project {
  tests_total: number;
  tests_in_progress: number;
  tests_passed: number;
  tests_failed: number;
  tests_void: number;
}

export interface PressureTest {
  id: string;
  company_id: string;
  project_id: string;
  ref: string;
  floor: string;
  system: SystemKind;
  system_other: string | null;
  area: string;
  status: TestStatus;
  result_at: string | null;
  result_by: string | null;
  locked: boolean;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  retest_of: string | null;
  initial_pressure_bar: number;
  initial_duration_min: number;
  strength_pressure_bar: number;
  strength_duration_min: number;
  pressure_pressure_bar: number;
  pressure_duration_min: number;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface TestStage {
  id: string;
  company_id: string;
  test_id: string;
  stage: StageKey;
  status: StageStatus;
  target_pressure_bar: number | null;
  target_duration_min: number | null;
  started_at: string | null;
  started_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TestPhoto {
  id: string;
  company_id: string;
  project_id: string;
  test_id: string;
  stage_id: string | null;
  stage: StageKey | null;
  kind: PhotoKind;
  storage_path: string;
  mime: string | null;
  size_bytes: number | null;
  taken_at: string;
  taken_by: string;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  company_id: string;
  actor_id: string | null;
  project_id: string | null;
  test_id: string | null;
  event_type: string;
  data: Record<string, unknown>;
  created_at: string;
}
