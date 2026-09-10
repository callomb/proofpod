import { notFound } from "next/navigation";

import { CollapsibleSection } from "@/components/collapsible-section";
import { TestRow } from "@/components/test-row";
import { BackLink, LinkButton } from "@/components/ui";
import { getProject, listProjectTests } from "@/lib/data";
import type { PressureTest } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectPage(props: PageProps<"/projects/[projectId]">) {
  const { projectId } = await props.params;
  const project = await getProject(projectId);
  if (!project) notFound();

  const tests = await listProjectTests(projectId);
  const by = (s: PressureTest["status"]) => tests.filter((t) => t.status === s);
  const inProgress = by("in_progress");
  const passed = by("passed");
  const failed = by("failed");
  const voided = by("void");

  return (
    <div>
      <div className="mb-3">
        <BackLink href="/home">Projects</BackLink>
      </div>

      <div className="mb-5">
        <h1 className="text-[24px] font-semibold tracking-tight">{project.name}</h1>
        {project.client_name || project.project_number ? (
          <p className="mt-0.5 text-[13px] text-muted">
            {[project.project_number, project.client_name].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>

      <LinkButton
        href={`/projects/${project.id}/tests/new`}
        size="lg"
        className="mb-6 w-full"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        New test
      </LinkButton>

      <CollapsibleSection title="In progress" count={inProgress.length} defaultOpen>
        {inProgress.map((t) => (
          <TestRow key={t.id} test={t} />
        ))}
      </CollapsibleSection>

      <CollapsibleSection title="Passed" count={passed.length}>
        {passed.map((t) => (
          <TestRow key={t.id} test={t} />
        ))}
      </CollapsibleSection>

      <CollapsibleSection title="Failed" count={failed.length}>
        {failed.map((t) => (
          <TestRow key={t.id} test={t} />
        ))}
      </CollapsibleSection>

      {voided.length > 0 ? (
        <CollapsibleSection title="Void" count={voided.length}>
          {voided.map((t) => (
            <TestRow key={t.id} test={t} />
          ))}
        </CollapsibleSection>
      ) : null}
    </div>
  );
}
