import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import { requireUser } from "./data";
import type { Company, CompanyMember, Profile } from "./types";

/** Is the current user allowed into /platform? Self-row check under normal RLS. */
export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return !!data;
});

/** Redirects anyone who isn't a platform admin back to /home. */
export async function requirePlatformAdmin() {
  const user = await requireUser();
  if (!(await isPlatformAdmin())) redirect("/home");
  return user;
}

export interface CompanyOverview extends Company {
  member_count: number;
  project_count: number;
}

/** Every company on ProofPod, with basic counts. Service role — bypasses RLS. */
export async function listAllCompanies(): Promise<CompanyOverview[]> {
  const admin = createAdminClient();
  const { data: companies } = await admin
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false });
  const rows = (companies ?? []) as Company[];
  if (rows.length === 0) return [];

  const [{ data: members }, { data: projects }] = await Promise.all([
    admin.from("company_members").select("company_id"),
    admin.from("projects").select("company_id"),
  ]);

  const memberCounts = new Map<string, number>();
  for (const m of (members ?? []) as { company_id: string }[]) {
    memberCounts.set(m.company_id, (memberCounts.get(m.company_id) ?? 0) + 1);
  }
  const projectCounts = new Map<string, number>();
  for (const p of (projects ?? []) as { company_id: string }[]) {
    projectCounts.set(p.company_id, (projectCounts.get(p.company_id) ?? 0) + 1);
  }

  return rows.map((c) => ({
    ...c,
    member_count: memberCounts.get(c.id) ?? 0,
    project_count: projectCounts.get(c.id) ?? 0,
  }));
}

export async function getCompanyForPlatform(companyId: string): Promise<Company | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("companies").select("*").eq("id", companyId).maybeSingle();
  return data as Company | null;
}

export interface MemberWithProfile {
  membership: CompanyMember;
  profile: Profile;
  email: string;
}

/** A company's members with profile + real auth email (service role). */
export async function listCompanyMembersForPlatform(
  companyId: string,
): Promise<MemberWithProfile[]> {
  const admin = createAdminClient();
  const { data: memberRows } = await admin
    .from("company_members")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  const memberships = (memberRows ?? []) as CompanyMember[];
  if (memberships.length === 0) return [];

  const { data: profileRows } = await admin
    .from("profiles")
    .select("*")
    .in(
      "id",
      memberships.map((m) => m.user_id),
    );
  const profiles = new Map(((profileRows ?? []) as Profile[]).map((p) => [p.id, p]));

  const out: MemberWithProfile[] = [];
  for (const m of memberships) {
    const profile = profiles.get(m.user_id);
    if (!profile) continue;
    const { data: authUser } = await admin.auth.admin.getUserById(m.user_id);
    out.push({ membership: m, profile, email: authUser?.user?.email ?? "" });
  }
  return out;
}
