import { InviteForm } from "@/components/settings-forms";
import { BackLink, Card } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { initials } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface MemberRow {
  user_id: string;
  role: string;
  created_at: string;
  profiles: { full_name: string; email: string | null } | null;
}

export default async function TeamPage() {
  const { company } = await getWorkspace();
  const supabase = await createClient();
  const { data } = await supabase
    .from("company_members")
    .select("user_id, role, created_at, profiles(full_name, email)")
    .eq("company_id", company.id)
    .order("created_at", { ascending: true });
  const members = (data ?? []) as unknown as MemberRow[];

  return (
    <div>
      <div className="mb-3">
        <BackLink href="/more">More</BackLink>
      </div>
      <h1 className="mb-6 text-[24px] font-semibold tracking-tight">Team</h1>

      <div className="mb-8 space-y-2">
        {members.map((m) => (
          <Card key={m.user_id} className="flex items-center gap-3 p-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-canvas text-[12px] font-semibold">
              {initials(m.profiles?.full_name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium">
                {m.profiles?.full_name || "Pending"}
              </p>
              <p className="truncate text-[12px] text-muted">
                {m.profiles?.email} · {m.role}
              </p>
            </div>
          </Card>
        ))}
      </div>

      <InviteForm companyId={company.id} />
    </div>
  );
}
