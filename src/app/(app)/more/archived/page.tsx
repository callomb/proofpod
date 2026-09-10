import { ReactivateButton } from "@/components/settings-forms";
import { BackLink } from "@/components/ui";
import { listArchivedProjects } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ArchivedPage() {
  const projects = await listArchivedProjects();
  return (
    <div>
      <div className="mb-3">
        <BackLink href="/more">More</BackLink>
      </div>
      <h1 className="mb-6 text-[24px] font-semibold tracking-tight">Archived projects</h1>
      {projects.length === 0 ? (
        <p className="text-[13px] text-muted">No archived projects.</p>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => (
            <ReactivateButton key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}
