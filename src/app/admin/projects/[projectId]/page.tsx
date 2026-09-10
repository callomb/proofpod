import Link from "next/link";
import { notFound } from "next/navigation";

import { CollapsibleSection } from "@/components/collapsible-section";
import { TestRow } from "@/components/test-row";
import { CertificatesPanel } from "@/components/admin/certificates-panel";
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
import { createClient } from "@/lib/supabase/server";
import type { PressureTest, TestProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

type Tab = "tests" | "details" | "certificates";
const TABS: { key: Tab; label: string }[] = [
  { key: "tests", label: "Tests" },
  { key: "details", label: "Project details" },
  { key: "certificates", label: "Certificates" },
];

export default async function AdminProjectPage(
  props: PageProps<"/admin/projects/[projectId]">,
) {
  const { projectId } = await props.params;
  const sp = await props.searchParams;
  const tab: Tab = ["tests", "details", "certificates"].includes(String(sp.tab))
    ? (sp.tab as Tab)
    : "tests";

  const [project, { company }] = await Promise.all([
    getProject(projectId),
    getWorkspace(),
  ]);
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
        </div>
      ) : null}

      {tab === "details" ? (
        <DetailsTab companyId={company.id} project={project} />
      ) : null}

      {tab === "certificates" ? (
        <CertificatesPanel
          projectId={projectId}
          passedTests={passed}
          certificates={await listProjectCertificates(projectId)}
        />
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
