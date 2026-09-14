"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import { createUsernameAccount, setUserPassword } from "./account-provisioning";
import { getWorkspace } from "./data";
import type { ProvisionActionResult } from "./platform-actions";

export type { ProvisionActionResult };

async function requireCompanyAdmin(companyId: string) {
  const ws = await getWorkspace();
  if (!ws.isAdmin || ws.company.id !== companyId) return null;
  return ws;
}

/** Company admin: add a staff member with a username + password (no email). */
export async function createStaffAction(
  _prev: ProvisionActionResult,
  formData: FormData,
): Promise<ProvisionActionResult> {
  const companyId = String(formData.get("company_id") || "");
  if (!(await requireCompanyAdmin(companyId))) return { error: "Admin access required." };

  const username = String(formData.get("username") || "").trim();
  const fullName = String(formData.get("full_name") || "").trim();
  const password = String(formData.get("password") || "").trim() || undefined;
  const role = formData.get("role") === "admin" ? "admin" : "member";

  const account = await createUsernameAccount({ username, fullName, password });
  if (account.error || !account.userId) return { error: account.error };

  // Membership creation needs the service role: a company admin has no RLS
  // grant to insert company_members rows directly (only the RPCs/admin flows do).
  const admin = createAdminClient();
  const { error } = await admin.from("company_members").insert({
    company_id: companyId,
    user_id: account.userId,
    role,
    status: "active",
  });
  if (error) {
    // Don't leave an orphaned, unusable-username account behind.
    await admin.auth.admin.deleteUser(account.userId);
    return { error: error.message };
  }

  revalidatePath("/admin/users");
  return { ok: true, username: username.toLowerCase(), password: account.password };
}

/** Company admin: reset a staff member's password. */
export async function resetStaffPasswordAction(
  companyId: string,
  userId: string,
): Promise<ProvisionActionResult> {
  if (!(await requireCompanyAdmin(companyId))) return { error: "Admin access required." };
  const result = await setUserPassword(userId);
  if (result.error) return { error: result.error };
  revalidatePath("/admin/users");
  return { ok: true, password: result.password };
}

/** Any signed-in user: change their own password. */
export async function changeOwnPasswordAction(
  _prev: ProvisionActionResult,
  formData: FormData,
): Promise<ProvisionActionResult> {
  const newPassword = String(formData.get("new_password") || "");
  const confirm = String(formData.get("confirm_password") || "");
  if (newPassword.length < 8) return { error: "Password must be at least 8 characters." };
  if (newPassword !== confirm) return { error: "Passwords don't match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };
  return { ok: true };
}
