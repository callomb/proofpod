"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "./platform";
import { createUsernameAccount, setUserPassword } from "./account-provisioning";
import { createAdminClient } from "./supabase/admin";
import { normalizeUsername } from "./domain";

export interface ProvisionActionResult {
  error?: string;
  ok?: boolean;
  username?: string;
  password?: string;
}

/** Platform admin: create a brand-new company with its admin, in one step. */
export async function createCompanyWithAdminAction(
  _prev: ProvisionActionResult,
  formData: FormData,
): Promise<ProvisionActionResult> {
  await requirePlatformAdmin();

  const companyName = String(formData.get("company_name") || "").trim();
  const adminName = String(formData.get("admin_name") || "").trim();
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "").trim() || undefined;

  if (!companyName) return { error: "Enter a company name." };

  const account = await createUsernameAccount({ username, fullName: adminName, password });
  if (account.error || !account.userId) return { error: account.error };

  const admin = createAdminClient();

  const { data: company, error: companyErr } = await admin
    .from("companies")
    .insert({ name: companyName, created_by: account.userId })
    .select()
    .single<{ id: string }>();
  if (companyErr || !company) {
    await admin.auth.admin.deleteUser(account.userId);
    return { error: companyErr?.message ?? "Could not create the company." };
  }

  const { error: memberErr } = await admin.from("company_members").insert({
    company_id: company.id,
    user_id: account.userId,
    role: "admin",
    status: "active",
  });
  if (memberErr) {
    await admin.auth.admin.deleteUser(account.userId);
    return { error: memberErr.message };
  }

  const { error: profileErr } = await admin.from("test_profiles").insert({
    company_id: company.id,
    name: "Company default",
    is_company_default: true,
    created_by: account.userId,
  });
  if (profileErr) return { error: profileErr.message };

  await admin.from("audit_events").insert({
    company_id: company.id,
    actor_id: account.userId,
    event_type: "company_created",
    data: { name: companyName, created_by_platform_admin: true },
  });

  revalidatePath("/platform");
  return { ok: true, username: normalizeUsername(username), password: account.password };
}

/** Platform admin: reset any user's password (support / lockouts). */
export async function platformResetPasswordAction(
  userId: string,
): Promise<ProvisionActionResult> {
  await requirePlatformAdmin();
  const result = await setUserPassword(userId);
  if (result.error) return { error: result.error };
  return { ok: true, password: result.password };
}

/** Platform admin: deactivate/reactivate a member of any company (support). */
export async function platformSetMemberStatusAction(
  companyId: string,
  userId: string,
  status: "active" | "inactive",
): Promise<ProvisionActionResult> {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("company_members")
    .update({ status })
    .eq("company_id", companyId)
    .eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath(`/platform/companies/${companyId}`);
  return { ok: true };
}
