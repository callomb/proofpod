import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import type {
  Company,
  CompanyMember,
  Profile,
  Project,
  ProjectOverview,
  PressureTest,
  TestPhoto,
  TestStage,
  AuditEvent,
} from "./types";

export interface Workspace {
  user: User;
  profile: Profile;
  company: Company;
  membership: CompanyMember;
  /** All members of the company, with their profiles, keyed for name lookups. */
  memberNames: Record<string, string>;
}

/** Current auth user or redirect to sign-in. */
export const requireUser = cache(async (): Promise<User> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  return user;
});

/**
 * The signed-in user's workspace (company + profile). Redirects to /onboarding
 * if the user has no company yet.
 */
export const getWorkspace = cache(async (): Promise<Workspace> => {
  const supabase = await createClient();
  const user = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  const { data: membership } = await supabase
    .from("company_members")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<CompanyMember>();

  if (!profile || !membership) redirect("/onboarding");

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", membership.company_id)
    .single<Company>();

  if (!company) redirect("/onboarding");

  const { data: members } = await supabase
    .from("company_members")
    .select("user_id")
    .eq("company_id", company.id);

  const userIds = (members ?? []).map((m) => (m as { user_id: string }).user_id);
  const { data: memberProfiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  const memberNames: Record<string, string> = {};
  for (const p of (memberProfiles ?? []) as { id: string; full_name: string }[]) {
    memberNames[p.id] = p.full_name || "Someone";
  }

  return { user, profile, company, membership, memberNames };
});

export async function listActiveProjects(): Promise<ProjectOverview[]> {
  const supabase = await createClient();
  const { company } = await getWorkspace();
  const { data } = await supabase
    .from("project_overview")
    .select("*")
    .eq("company_id", company.id)
    .eq("status", "active")
    .order("updated_at", { ascending: false });
  return (data ?? []) as ProjectOverview[];
}

export async function listArchivedProjects(): Promise<ProjectOverview[]> {
  const supabase = await createClient();
  const { company } = await getWorkspace();
  const { data } = await supabase
    .from("project_overview")
    .select("*")
    .eq("company_id", company.id)
    .eq("status", "archived")
    .order("archived_at", { ascending: false });
  return (data ?? []) as ProjectOverview[];
}

export async function getProject(projectId: string): Promise<Project | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle<Project>();
  return data;
}

export async function listProjectTests(projectId: string): Promise<PressureTest[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pressure_tests")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return (data ?? []) as PressureTest[];
}

export async function getTest(testId: string): Promise<PressureTest | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pressure_tests")
    .select("*")
    .eq("id", testId)
    .maybeSingle<PressureTest>();
  return data;
}

export async function listTestStages(testId: string): Promise<TestStage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("test_stages")
    .select("*")
    .eq("test_id", testId);
  return (data ?? []) as TestStage[];
}

export async function listTestPhotos(testId: string): Promise<TestPhoto[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("test_photos")
    .select("*")
    .eq("test_id", testId)
    .order("taken_at", { ascending: true });
  return (data ?? []) as TestPhoto[];
}

export async function listTestAudit(testId: string): Promise<AuditEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_events")
    .select("*")
    .eq("test_id", testId)
    .order("created_at", { ascending: true });
  return (data ?? []) as AuditEvent[];
}

/** Retests that point back at this test. */
export async function listRelatedTests(testId: string): Promise<PressureTest[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pressure_tests")
    .select("*")
    .eq("retest_of", testId)
    .order("created_at", { ascending: true });
  return (data ?? []) as PressureTest[];
}

/**
 * Signed URLs for a set of storage paths in the `evidence` bucket.
 * Uses the service role so the URL works in an <img> without a session.
 */
export async function signEvidenceUrls(
  paths: string[],
  expiresIn = 60 * 60,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from("evidence")
    .createSignedUrls(paths, expiresIn);
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}
