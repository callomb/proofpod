import Link from "next/link";
import { notFound } from "next/navigation";

import { CollapsibleSection } from "@/components/collapsible-section";
import { TestRow } from "@/components/test-row";
import { AcSystemRow } from "@/components/ac/ac-system-row";
import { StandaloneAcPressureTestRow } from "@/components/ac/standalone-pressure-test-row";
import { CertificatesPanel } from "@/components/admin/certificates-panel";
import { AcSystemsPanel } from "@/components/admin/ac-systems-panel";
import {
  ProjectDetailsForm,
  ProjectTestSettings,
} from "@/components/admin/project-details";
import { BackLink, LinkButton } from "@/components/ui";
import {
  getProject,
  getWorkspace,
  listProjectCertificates,
  listProjectTests,
} from "@/lib/data";
import {
  getAcProjectSettings,
  listProjectAcCertificates,
  listProjectAcSystems,
  listStandaloneAcPressureTests,
} from "@/lib/ac/data";
import { createClient } from "@/lib/supabase/server";
import type { PressureTest, TestProfile } from "@/lib/types";
import type { AcPressureTest, AcSystem } from "@/lib/ac/types";

export const dynamic = "force-dynamic";

type Tab = "tests" | "details" | "certificates";
const TABS: { key: Tab; label: string }[] = [
  { key: "tests", label: "Tests" },
  { key: "details", label: "Project details" },
  { key: "certificates", label: "Certificates" },
];

function AcOverviewSection({
  projectId,
  systems,
  standaloneTests,
}: {
  projectId: string;
  systems: AcSystem[];
  standaloneTests: AcPressureTest[];
}) {
  const by = (s: AcSystem["status"]) => systems.filter((sys) => sys.status === s);
  const testBy = (s: AcPressureTest["status"]) => standaloneTests.filter((t) => t.status === s);

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
        AC Commissioning
      </h2>
      <CollapsibleSection title="Systems — in progress" count={by("in_progress").length} defaultOpen>
        {by("in_progress").map((s) => (
          <AcSystemRow key={s.id} system={s} projectId={projectId} />
        ))}
      </CollapsibleSection>
      <CollapsibleSection title="Systems — complete" count={by("complete").length}>
        {by("complete").map((s) => (
          <AcSystemRow key={s.id} system={s} projectId={projectId} />
        ))}
      </CollapsibleSection>
      {by("void").length > 0 ? (
        <CollapsibleSection title="Systems — void" count={by("void").length}>
          {by("void").map((s) => (
            <AcSystemRow key={s.id} system={s} projectId={projectId} />
          ))}
        </CollapsibleSection>
      ) : null}
      {standaloneTests.length > 0 ? (
        <>
          <CollapsibleSection title="Pressure tests — in progress" count={testBy("in_progress").length}>
            {testBy("in_progress").map((t) => (
              <StandaloneAcPressureTestRow key={t.lineage_id} test={t} projectId={projectId} />
            ))}
          </CollapsibleSection>
          <CollapsibleSection
            title="Pressure tests — resolved"
            count={standaloneTests.length - testBy("in_progress").length}
          >
            {standaloneTests
              .filter((t) => t.status !== "in_progress")
              .map((t) => (
                <StandaloneAcPressureTestRow key={t.lineage_id} test={t} projectId={projectId} />
              ))}
          </CollapsibleSection>
        </>
      ) : null}
    </div>
  );
}

export default async function AdminProjectPage(
  props: PageProps<"/admin/projects/[projectId]">,
) {
  const { projectId } = await props.params;
  const sp = await props.searchParams;

  const [project, { company, modules }] = await Promise.all([
    getProject(projectId),
    getWorkspace(),
  ]);
  if (!project) notFound();

  const hasAc = modules.includes("ac_commissioning");
  const tab: Tab = TABS.map((t) => t.key).includes(sp.tab as Tab) ? (sp.tab as Tab) : "tests";

  const tests = await listProjectTests(projectId);
  const by = (s: PressureTest["status"]) => tests.filter((t) => t.status === s);
  const inProgress = by("in_progress");
  const passed = by("passed");
  const failed = by("failed");
  const voided = by("void");

  const [acSystems, acStandaloneTests] = hasAc
    ? await Promise.all([listProjectAcSystems(projectId), listStandaloneAcPressureTests(projectId)])
    : [[], []];

  return (
    <div>
      <div className="mb-3">
        <BackLink href="/admin/projects">Projects</BackLink>
      </div>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">{project.name}</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {[project.project_number, project.client_name].filter(Boolean).join(" · ") ||
              "No details yet"}
          </p>
        </div>
        {tab === "tests" ? (
          <LinkButton href={`/admin/projects/${projectId}/tests/new`}>+ New test</LinkButton>
        ) : null}
      </div>

      <div className="mb-6 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/projects/${projectId}?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2.5 text-[13px] font-medium ${
              tab === t.key
                ? "border-ink text-ink"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "tests" ? (
        <div>
          <CollapsibleSection title="In progress" count={inProgress.length} defaultOpen>
            {inProgress.map((t) => (
              <TestRow key={t.id} test={t} basePath="/admin/projects" />
            ))}
          </CollapsibleSection>
          <CollapsibleSection title="Passed" count={passed.length}>
            {passed.map((t) => (
              <TestRow key={t.id} test={t} basePath="/admin/projects" />
            ))}
          </CollapsibleSection>
          <CollapsibleSection title="Failed" count={failed.length}>
            {failed.map((t) => (
              <TestRow key={t.id} test={t} basePath="/admin/projects" />
            ))}
          </CollapsibleSection>
          <CollapsibleSection title="Voided" count={voided.length}>
            {voided.map((t) => (
              <TestRow key={t.id} test={t} basePath="/admin/projects" />
            ))}
          </CollapsibleSection>

          {hasAc ? (
            <AcOverviewSection projectId={projectId} systems={acSystems} standaloneTests={acStandaloneTests} />
          ) : null}
        </div>
      ) : null}

      {tab === "details" ? (
        <DetailsTab companyId={company.id} project={project} />
      ) : null}

      {tab === "certificates" ? (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
              Plumbing
            </h2>
            <CertificatesPanel
              projectId={projectId}
              passedTests={passed}
              certificates={await listProjectCertificates(projectId)}
            />
          </section>

          {hasAc ? (
            <section>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
                AC Commissioning
              </h2>
              <AcSystemsPanel
                projectId={projectId}
                systems={acSystems}
                certificates={await listProjectAcCertificates(projectId)}
                projectSettings={await getAcProjectSettings(projectId)}
              />
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

async function DetailsTab({
  companyId,
  project,
}: {
  companyId: string;
  project: Awaited<ReturnType<typeof getProject>>;
}) {
  const supabase = await createClient();
  const { data: companyDefault } = await supabase
    .from("test_profiles")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_company_default", true)
    .maybeSingle<TestProfile>();

  if (!project || !companyDefault) return null;

  return (
    <div className="space-y-6">
      <ProjectDetailsForm project={project} />
      <ProjectTestSettings project={project} companyDefault={companyDefault} />
    </div>
  );
}
