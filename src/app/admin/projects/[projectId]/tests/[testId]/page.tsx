import { notFound } from "next/navigation";

import { AdminTestView, type AdminPhoto } from "@/components/admin/admin-test-view";
import { BackLink } from "@/components/ui";
import {
  getProject,
  getTest,
  getWorkspace,
  listRelatedTests,
  listTestPhotos,
  listTestStages,
  signEvidenceUrls,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminTestPage(
  props: PageProps<"/admin/projects/[projectId]/tests/[testId]">,
) {
  const { projectId, testId } = await props.params;

  const [test, project, { memberNames }] = await Promise.all([
    getTest(testId),
    getProject(projectId),
    getWorkspace(),
  ]);
  if (!test || !project || test.project_id !== projectId) notFound();

  const [stages, rawPhotos, retests] = await Promise.all([
    listTestStages(testId),
    listTestPhotos(testId),
    listRelatedTests(testId),
  ]);

  const urls = await signEvidenceUrls(rawPhotos.map((p) => p.storage_path));
  const photos: AdminPhoto[] = rawPhotos.map((p) => ({
    id: p.id,
    kind: p.kind,
    stage: p.stage,
    url: urls[p.storage_path] ?? null,
    taken_at: p.taken_at,
    taken_by_name: memberNames[p.taken_by] ?? "Someone",
  }));

  let sourceRef: string | null = null;
  if (test.retest_of) {
    const src = await getTest(test.retest_of);
    sourceRef = src?.ref ?? null;
  }

  return (
    <div>
      <div className="mb-3">
        <BackLink href={`/admin/projects/${projectId}`}>{project.name}</BackLink>
      </div>
      <AdminTestView
        test={test}
        stages={stages}
        photos={photos}
        memberNames={memberNames}
        sourceRef={sourceRef}
        sourceId={test.retest_of}
        retests={retests.map((r) => ({ id: r.id, ref: r.ref, status: r.status }))}
      />
    </div>
  );
}
