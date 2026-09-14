import { AdminProjects } from "@/components/admin/admin-projects";
import { getWorkspace, listActiveProjects, listArchivedProjects } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminProjectsPage() {
  const [{ company }, active, archived] = await Promise.all([
    getWorkspace(),
    listActiveProjects(),
    listArchivedProjects(),
  ]);

  return <AdminProjects active={active} archived={archived} companyId={company.id} />;
}
