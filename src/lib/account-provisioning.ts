import "server-only";

import { createAdminClient } from "./supabase/admin";
import { generatePassword, isValidUsername, normalizeUsername, usernameToEmail } from "./domain";

export interface ProvisionResult {
  userId?: string;
  password?: string;
  error?: string;
}

/**
 * Creates a brand-new auth user identified by a username (no real email
 * involved) and returns the password so the caller can hand it to whoever
 * will use the account. Used both for a new company's admin (platform admin
 * flow) and for staff added by a company admin.
 */
export async function createUsernameAccount(input: {
  username: string;
  fullName: string;
  password?: string;
}): Promise<ProvisionResult> {
  const username = normalizeUsername(input.username);
  const fullName = input.fullName.trim();

  if (!isValidUsername(username)) {
    return {
      error:
        "Usernames must be 3-32 characters: lowercase letters, numbers, dots, dashes or underscores.",
    };
  }
  if (!fullName) return { error: "Enter a name." };

  const password = input.password?.trim() || generatePassword();
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existing) return { error: `The username "${username}" is already taken.` };

  const { data, error } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, username },
  });
  if (error || !data.user) {
    return { error: error?.message ?? "Could not create the account." };
  }

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ username, full_name: fullName })
    .eq("id", data.user.id);
  if (profileErr) {
    return { error: profileErr.message };
  }

  return { userId: data.user.id, password };
}

/** Sets a new password for an existing account (admin- or platform-admin-driven reset). */
export async function setUserPassword(
  userId: string,
  password?: string,
): Promise<ProvisionResult> {
  const pw = password?.trim() || generatePassword();
  if (pw.length < 8) return { error: "Password must be at least 8 characters." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: pw });
  if (error) return { error: error.message };
  return { userId, password: pw };
}
