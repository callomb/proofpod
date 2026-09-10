"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "./supabase/server";
import type { PressureTest, ProjectStatus } from "./types";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

// ===========================================================================
// Auth
// ===========================================================================
export async function signInAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/home");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect(next.startsWith("/") ? next : "/home");
}

export async function signUpAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const fullName = String(formData.get("full_name") || "").trim();
  const companyName = String(formData.get("company_name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const inviteToken = String(formData.get("invite") || "").trim();

  if (!fullName) return { error: "Enter your name." };
  if (!email || password.length < 8)
    return { error: "Enter an email and a password of at least 8 characters." };
  if (!inviteToken && !companyName) return { error: "Enter your company name." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${siteUrl()}/auth/callback`,
    },
  });
  if (error) return { error: error.message };

  // If email confirmation is on, there is no session yet.
  if (!data.session) {
    return {
      ok: true,
      error:
        "Check your email to confirm your account, then sign in. (You can turn off email confirmation in Supabase for the beta.)",
    };
  }

  if (inviteToken) {
    const { error: e } = await supabase.rpc("accept_invite", {
      p_token: inviteToken,
      p_full_name: fullName,
    });
    if (e) return { error: e.message };
  } else {
    const { error: e } = await supabase.rpc("bootstrap_company", {
      p_full_name: fullName,
      p_company_name: companyName,
    });
    if (e) return { error: e.message };
  }

  redirect("/home");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

// ===========================================================================
// Onboarding (already-authenticated user with no company)
// ===========================================================================
export async function createCompanyAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const fullName = String(formData.get("full_name") || "").trim();
  const companyName = String(formData.get("company_name") || "").trim();
  if (!companyName) return { error: "Enter your company name." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("bootstrap_company", {
    p_full_name: fullName,
    p_company_name: companyName,
  });
  if (error) return { error: error.message };
  redirect("/home");
}

export async function acceptInviteAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const token = String(formData.get("invite") || "").trim();
  const fullName = String(formData.get("full_name") || "").trim();
  if (!token) return { error: "Missing invite code." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", {
    p_token: token,
    p_full_name: fullName,
  });
  if (error) return { error: error.message };
  redirect("/home");
}

// ===========================================================================
// Projects
// ===========================================================================
export async function createProjectAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const name = String(formData.get("name") || "").trim();
  const companyId = String(formData.get("company_id") || "");
  if (!name) return { error: "Enter a project name." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_project", { p_company_id: companyId, p_name: name })
    .select()
    .single();
  if (error) return { error: error.message };

  revalidatePath("/home");
  redirect(`/projects/${(data as { id: string }).id}`);
}

export async function setProjectStatusAction(
  projectId: string,
  status: ProjectStatus,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_project_status", {
    p_project_id: projectId,
    p_status: status,
  });
  if (error) return { error: error.message };
  revalidatePath("/home");
  revalidatePath("/more/archived");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function updateProjectMetaAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const projectId = String(formData.get("project_id") || "");
  const patch = {
    name: String(formData.get("name") || "").trim(),
    project_number: String(formData.get("project_number") || "").trim() || null,
    client_name: String(formData.get("client_name") || "").trim() || null,
    site_address: String(formData.get("site_address") || "").trim() || null,
  };
  if (!patch.name) return { error: "Project name cannot be empty." };

  const supabase = await createClient();
  const { error } = await supabase.from("projects").update(patch).eq("id", projectId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/home");
  return { ok: true };
}

// ===========================================================================
// Tests
// ===========================================================================
export async function createTestAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const projectId = String(formData.get("project_id") || "");
  const floor = String(formData.get("floor") || "0");
  const system = String(formData.get("system") || "cold");
  const systemOther = String(formData.get("system_other") || "").trim();
  const area = String(formData.get("area") || "").trim();
  if (!area) return { error: "Enter the area being tested." };
  if (system === "other" && !systemOther)
    return { error: "Name the system, or pick one from the list." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_test", {
      p_project_id: projectId,
      p_floor: floor,
      p_system: system,
      p_area: area,
      p_system_other: systemOther || null,
    })
    .select()
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}/tests/${(data as { id: string }).id}`);
}

export async function updateTestSettingsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const testId = String(formData.get("test_id") || "");
  const num = (k: string) => Number(formData.get(k));
  const int = (k: string) => Math.round(Number(formData.get(k)));

  const supabase = await createClient();
  const { data: test } = await supabase
    .from("pressure_tests")
    .select("project_id")
    .eq("id", testId)
    .single<{ project_id: string }>();

  const { error } = await supabase.rpc("update_test_settings", {
    p_test_id: testId,
    p_initial_pressure_bar: num("initial_pressure_bar"),
    p_initial_duration_min: int("initial_duration_min"),
    p_strength_pressure_bar: num("strength_pressure_bar"),
    p_strength_duration_min: int("strength_duration_min"),
    p_pressure_pressure_bar: num("pressure_pressure_bar"),
    p_pressure_duration_min: int("pressure_duration_min"),
  });
  if (error) return { error: error.message };

  if (test) revalidatePath(`/projects/${test.project_id}/tests/${testId}`);
  return { ok: true };
}

export async function startStageAction(stageId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_stage", { p_stage_id: stageId });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function completeStageAction(stageId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_stage", { p_stage_id: stageId });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function recordPhotoAction(input: {
  testId: string;
  storagePath: string;
  kind: "start" | "end" | "other";
  stageId?: string | null;
  mime?: string | null;
  sizeBytes?: number | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_photo", {
    p_test_id: input.testId,
    p_storage_path: input.storagePath,
    p_kind: input.kind,
    p_stage_id: input.stageId ?? null,
    p_mime: input.mime ?? null,
    p_size_bytes: input.sizeBytes ?? null,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function setTestResultAction(
  testId: string,
  result: "passed" | "failed",
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_test_result", {
    p_test_id: testId,
    p_result: result,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function voidTestAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const testId = String(formData.get("test_id") || "");
  const reason = String(formData.get("reason") || "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_test", {
    p_test_id: testId,
    p_reason: reason || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function createRetestAction(testId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: src } = await supabase
    .from("pressure_tests")
    .select("project_id")
    .eq("id", testId)
    .single<{ project_id: string }>();

  const { data, error } = await supabase
    .rpc("create_retest", { p_test_id: testId })
    .select()
    .single<PressureTest>();
  if (error) return { error: error.message };

  if (src) revalidatePath(`/projects/${src.project_id}`);
  redirect(`/projects/${data!.project_id}/tests/${data!.id}`);
}

// ===========================================================================
// Team & company
// ===========================================================================
export async function createInviteAction(
  _prev: ActionResult & { link?: string },
  formData: FormData,
): Promise<ActionResult & { link?: string }> {
  const companyId = String(formData.get("company_id") || "");
  const email = String(formData.get("email") || "").trim();

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_invite", {
      p_company_id: companyId,
      p_email: email || null,
      p_role: "member",
    })
    .select()
    .single<{ token: string }>();
  if (error) return { error: error.message };

  revalidatePath("/more/team");
  return { ok: true, link: `${siteUrl()}/sign-up?invite=${data!.token}` };
}

export async function updateCompanyAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const companyId = String(formData.get("company_id") || "");
  const patch = {
    name: String(formData.get("name") || "").trim(),
    address_line1: String(formData.get("address_line1") || "").trim() || null,
    address_line2: String(formData.get("address_line2") || "").trim() || null,
    city: String(formData.get("city") || "").trim() || null,
    postcode: String(formData.get("postcode") || "").trim() || null,
    phone: String(formData.get("phone") || "").trim() || null,
  };
  if (!patch.name) return { error: "Company name cannot be empty." };

  const supabase = await createClient();
  const { error } = await supabase.from("companies").update(patch).eq("id", companyId);
  if (error) return { error: error.message };
  revalidatePath("/more/company");
  return { ok: true };
}

export async function updateTestProfileAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const profileId = String(formData.get("profile_id") || "");
  const num = (k: string) => Number(formData.get(k));
  const int = (k: string) => Math.round(Number(formData.get(k)));

  const supabase = await createClient();
  const { error } = await supabase
    .from("test_profiles")
    .update({
      initial_pressure_bar: num("initial_pressure_bar"),
      initial_duration_min: int("initial_duration_min"),
      strength_pressure_bar: num("strength_pressure_bar"),
      strength_duration_min: int("strength_duration_min"),
      pressure_pressure_bar: num("pressure_pressure_bar"),
      pressure_duration_min: int("pressure_duration_min"),
    })
    .eq("id", profileId);
  if (error) return { error: error.message };
  revalidatePath("/more/company");
  return { ok: true };
}

export async function updateProfileAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const fullName = String(formData.get("full_name") || "").trim();
  if (!fullName) return { error: "Enter your name." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function seedDemoAction(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("seed_demo_data");
  if (error) return { error: error.message };
  revalidatePath("/home");
  return { ok: true };
}
