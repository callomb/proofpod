import { GreetingLine, ProjectList } from "@/components/home";
import { getWorkspace, listActiveProjects } from "@/lib/data";
import { firstName } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [{ company, profile }, projects] = await Promise.all([
    getWorkspace(),
    listActiveProjects(),
  ]);

  return (
    <div>
      <GreetingLine firstName={firstName(profile.full_name)} />
      <p className="mb-6 mt-1 text-[15px] text-muted">Select a project to get started.</p>
      <ProjectList projects={projects} companyId={company.id} />
    </div>
  );
}
