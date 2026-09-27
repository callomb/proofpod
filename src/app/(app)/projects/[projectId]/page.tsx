import Link from "next/link";
import { notFound } from "next/navigation";

import { AcSystemRow } from "@/components/ac/ac-system-row";
import { StandaloneAcPressureTestRow } from "@/components/ac/standalone-pressure-test-row";
import { CollapsibleSection } from "@/components/collapsible-section";
import { TestRow } from "@/components/test-row";
import { BackLink, LinkButton } from "@/components/ui";
import { listProjectAcSystems, listStandaloneAcPressureTests } from "@/lib/ac/data";
import { getProject, getWorkspace, listProjectTests } from "@/lib/data";
import type { ModuleKey } from "@/lib/data";
import type { AcPressureTest, AcSystem } from "@/lib/ac/types";
import type { PressureTest } from "@/lib/types";

export const dynamic = "force-dynamic";

const PlusIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const MODULE_LABEL: Record<ModuleKey, string> = {
  plumbing: "Plumbing",
  ac_commissioning: "AC Commissioning",
};

function PlumbingSection({ tests, projectId }: { tests: PressureTest[]; projectId: string }) {
  const by = (s: PressureTest["status"]) => tests.filter((t) => t.status === s);
  const inProgress = by("in_progress");
  const passed = by("passed");
  const failed = by("failed");
  const voided = by("void");

  return (
    <div>
      <LinkButton href={`/projects/${projectId}/tests/new`} size="lg" className="mb-6 w-full">
        {PlusIcon}
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

function AcSection({
  systems,
  standaloneTests,
  projectId,
}: {
  systems: AcSystem[];
  standaloneTests: AcPressureTest[];
  projectId: string;
}) {
  const by = (s: AcSystem["status"]) => systems.filter((sys) => sys.status === s);
  const inProgress = by("in_progress");
  const complete = by("complete");
  const voided = by("void");

  const byTest = (s: AcPressureTest["status"]) => standaloneTests.filter((t) => t.status === s);
  const testsInProgress = byTest("in_progress");
  const testsResolved = standaloneTests.filter((t) => t.status === "passed" || t.status === "failed");

  return (
    <div>
      <LinkButton href={`/projects/${projectId}/ac/new`} size="lg" className="mb-6 w-full">
        {PlusIcon}
        New
      </LinkButton>

      <CollapsibleSection title="Systems — in progress" count={inProgress.length} defaultOpen>
        {inProgress.map((s) => (
          <AcSystemRow key={s.id} system={s} projectId={projectId} />
        ))}
      </CollapsibleSection>

      <CollapsibleSection title="Systems — complete" count={complete.length}>
        {complete.map((s) => (
          <AcSystemRow key={s.id} system={s} projectId={projectId} />
        ))}
      </CollapsibleSection>

      {voided.length > 0 ? (
        <CollapsibleSection title="Systems — void" count={voided.length}>
          {voided.map((s) => (
            <AcSystemRow key={s.id} system={s} projectId={projectId} />
          ))}
        </CollapsibleSection>
      ) : null}

      {standaloneTests.length > 0 ? (
        <>
          <CollapsibleSection title="Pressure tests — in progress" count={testsInProgress.length}>
            {testsInProgress.map((t) => (
              <StandaloneAcPressureTestRow key={t.lineage_id} test={t} projectId={projectId} />
            ))}
          </CollapsibleSection>
          <CollapsibleSection title="Pressure tests — resolved" count={testsResolved.length}>
            {testsResolved.map((t) => (
              <StandaloneAcPressureTestRow key={t.lineage_id} test={t} projectId={projectId} />
            ))}
          </CollapsibleSection>
        </>
      ) : null}
    </div>
  );
}

export default async function ProjectPage(props: PageProps<"/projects/[projectId]">) {
  const { projectId } = await props.params;
  const sp = await props.searchParams;
  const [project, { modules }] = await Promise.all([getProject(projectId), getWorkspace()]);
  if (!project) notFound();

  // Single module (true for every company today): render that module's content
  // directly, no tabs, no extra tap — identical to the pre-multi-module page.
  const activeModule: ModuleKey = modules.includes(sp.module as ModuleKey)
    ? (sp.module as ModuleKey)
    : modules[0];

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

      {modules.length > 1 ? (
        <div className="mb-6 flex gap-1 border-b border-line">
          {modules.map((m) => (
            <Link
              key={m}
              href={`/projects/${projectId}?module=${m}`}
              aria-current={activeModule === m ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2.5 text-[13px] font-medium ${
                activeModule === m
                  ? "border-ink text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {MODULE_LABEL[m]}
            </Link>
          ))}
        </div>
      ) : null}

      {activeModule === "ac_commissioning" ? (
        <AcSection
          systems={await listProjectAcSystems(projectId)}
          standaloneTests={await listStandaloneAcPressureTests(projectId)}
          projectId={projectId}
        />
      ) : (
        <PlumbingSection tests={await listProjectTests(projectId)} projectId={projectId} />
      )}
    </div>
  );
}
