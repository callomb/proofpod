import { notFound } from "next/navigation";

import { CompanyDetail } from "@/components/platform/company-detail";
import { BackLink } from "@/components/ui";
import { getCompanyForPlatform, listCompanyMembersForPlatform } from "@/lib/platform";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function PlatformCompanyPage(props: PageProps<"/platform/companies/[id]">) {
  const { id } = await props.params;
  const company = await getCompanyForPlatform(id);
  if (!company) notFound();

  const [members, projectCount] = await Promise.all([
    listCompanyMembersForPlatform(id),
    createAdminClient()
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("company_id", id)
      .then(({ count }) => count ?? 0),
  ]);

  return (
    <div>
      <div className="mb-3">
        <BackLink href="/platform">Companies</BackLink>
      </div>
      <CompanyDetail
        companyId={id}
        companyName={company.name}
        members={members}
        projectCount={projectCount}
      />
    </div>
  );
}
