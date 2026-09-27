import { GreetingLine, ProjectList } from "@/components/home";
import { getWorkspace, listActiveProjects } from "@/lib/data";
import { getCompanyAcCounts, mergeAcCounts } from "@/lib/ac/data";
import { firstName } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [{ company, profile, modules }, projects] = await Promise.all([
    getWorkspace(),
    listActiveProjects(),
  ]);

  const combined = modules.includes("ac_commissioning")
    ? mergeAcCounts(projects, await getCompanyAcCounts(company.id))
    : projects;

  return (
    <div>
      <GreetingLine firstName={firstName(profile.full_name)} />
      <p className="mb-6 mt-1 text-[15px] text-muted">Select a project to get started.</p>
      <ProjectList projects={combined} companyId={company.id} />
    </div>
  );
}
