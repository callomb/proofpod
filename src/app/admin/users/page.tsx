import { UsersPanel, type MemberView } from "@/components/admin/users-panel";
import { getWorkspace } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const { company, user } = await getWorkspace();
  const supabase = await createClient();

  const { data: memberRows } = await supabase
    .from("company_members")
    .select("user_id, role, status, created_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: true });

  const rows = (memberRows ?? []) as {
    user_id: string;
    role: string;
    status: string;
    created_at: string;
  }[];

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in(
      "id",
      rows.length ? rows.map((r) => r.user_id) : ["00000000-0000-0000-0000-000000000000"],
    );
  const profiles = new Map(
    ((profileRows ?? []) as { id: string; full_name: string; email: string | null }[]).map(
      (p) => [p.id, p],
    ),
  );

  const members: MemberView[] = rows.map((r) => ({
    user_id: r.user_id,
    full_name: profiles.get(r.user_id)?.full_name ?? "",
    email: profiles.get(r.user_id)?.email ?? null,
    role: r.role === "admin" || r.role === "owner" ? "admin" : "member",
    status: r.status === "inactive" ? "inactive" : "active",
  }));

  return <UsersPanel members={members} companyId={company.id} currentUserId={user.id} />;
}
