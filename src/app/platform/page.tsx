import { CompaniesPanel } from "@/components/platform/companies-panel";
import { listAllCompanies } from "@/lib/platform";

export const dynamic = "force-dynamic";

export default async function PlatformHomePage() {
  const companies = await listAllCompanies();
  return <CompaniesPanel companies={companies} />;
}
