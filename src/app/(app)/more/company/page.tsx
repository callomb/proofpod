import { CompanyForm, TestProfileForm } from "@/components/settings-forms";
import { BackLink } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { TestProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  const { company } = await getWorkspace();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("test_profiles")
    .select("*")
    .eq("company_id", company.id)
    .eq("is_company_default", true)
    .maybeSingle<TestProfile>();

  return (
    <div>
      <div className="mb-3">
        <BackLink href="/more">More</BackLink>
      </div>
      <h1 className="mb-6 text-[24px] font-semibold tracking-tight">Company</h1>

      <CompanyForm company={company} />

      <div className="mt-10 border-t border-line pt-6">
        <h2 className="mb-4 text-[17px] font-semibold">Default test values</h2>
        {profile ? (
          <TestProfileForm profile={profile} />
        ) : (
          <p className="text-[13px] text-muted">
            No default profile found — re-run the schema migration.
          </p>
        )}
      </div>
    </div>
  );
}
