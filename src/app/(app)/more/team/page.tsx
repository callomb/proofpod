import { InviteForm } from "@/components/settings-forms";
import { BackLink, Card } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { initials } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const { company } = await getWorkspace();
  const supabase = await createClient();

  const { data: memberRows } = await supabase
    .from("company_members")
    .select("user_id, role, created_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: true });

  const members = (memberRows ?? []) as {
    user_id: string;
    role: string;
    created_at: string;
  }[];

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in(
      "id",
      members.length
        ? members.map((m) => m.user_id)
        : ["00000000-0000-0000-0000-000000000000"],
    );

  const profiles = new Map(
    ((profileRows ?? []) as { id: string; full_name: string; email: string | null }[]).map(
      (p) => [p.id, p],
    ),
  );

  return (
    <div>
      <div className="mb-3">
        <BackLink href="/more">More</BackLink>
      </div>
      <h1 className="mb-6 text-[24px] font-semibold tracking-tight">Team</h1>

      <div className="mb-8 space-y-2">
        {members.map((m) => {
          const p = profiles.get(m.user_id);
          return (
            <Card key={m.user_id} className="flex items-center gap-3 p-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-canvas text-[12px] font-semibold">
                {initials(p?.full_name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium">{p?.full_name || "Pending"}</p>
                <p className="truncate text-[12px] text-muted">
                  {[p?.email, m.role].filter(Boolean).join(" · ")}
                </p>
              </div>
            </Card>
          );
        })}
      </div>

      <InviteForm companyId={company.id} />
    </div>
  );
}
