import { CompanyForm, TestProfileForm } from "@/components/settings-forms";
import { CompanyLogo } from "@/components/admin/company-logo";
import { Card } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { TestProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

function publicBrandingUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/branding/${path}`;
}

export default async function AdminCompanyPage() {
  const { company } = await getWorkspace();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("test_profiles")
    .select("*")
    .eq("company_id", company.id)
    .eq("is_company_default", true)
    .maybeSingle<TestProfile>();

  return (
    <div className="max-w-[640px]">
      <h1 className="mb-6 text-[26px] font-semibold tracking-tight">Company settings</h1>

      <div className="space-y-6">
        <Card className="p-5">
          <h3 className="mb-4 text-[15px] font-semibold">Company details</h3>
          <CompanyForm company={company} />
        </Card>

        <CompanyLogo companyId={company.id} logoUrl={publicBrandingUrl(company.logo_path)} />

        <Card className="p-5">
          <h3 className="mb-1 text-[15px] font-semibold">Default pressure test profile</h3>
          <p className="mb-4 text-[13px] text-muted">
            New projects inherit these values unless a project overrides them.
          </p>
          {profile ? (
            <TestProfileForm profile={profile} />
          ) : (
            <p className="text-[13px] text-muted">
              No default profile found — re-run the schema migration.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
