import { AdminProjects } from "@/components/admin/admin-projects";
import { getWorkspace, listActiveProjects, listArchivedProjects } from "@/lib/data";
import { getCompanyAcCounts, mergeAcCounts } from "@/lib/ac/data";

export const dynamic = "force-dynamic";

export default async function AdminProjectsPage() {
  const [{ company, modules }, active, archived] = await Promise.all([
    getWorkspace(),
    listActiveProjects(),
    listArchivedProjects(),
  ]);

  const acCounts = modules.includes("ac_commissioning")
    ? await getCompanyAcCounts(company.id)
    : null;

  return (
    <AdminProjects
      active={acCounts ? mergeAcCounts(active, acCounts) : active}
      archived={acCounts ? mergeAcCounts(archived, acCounts) : archived}
      companyId={company.id}
    />
  );
}
