import Link from "next/link";
import { notFound } from "next/navigation";

import { AC_SYSTEM_TYPE_META } from "@/lib/ac/domain";
import type { AcSystemType } from "@/lib/ac/types";
import { BackLink, Card } from "@/components/ui";
import { getProject } from "@/lib/data";

export const dynamic = "force-dynamic";

const ROUTE: Partial<Record<AcSystemType, string>> = {
  split: "split",
};

export default async function NewAcSystemTypePage(
  props: PageProps<"/projects/[projectId]/ac/new">,
) {
  const { projectId } = await props.params;
  const project = await getProject(projectId);
  if (!project) notFound();

  return (
    <div>
      <div className="mb-3">
        <BackLink href={`/projects/${projectId}`}>{project.name}</BackLink>
      </div>
      <h1 className="mb-6 text-[24px] font-semibold tracking-tight">New AC system</h1>

      <div className="space-y-2.5">
        {(Object.keys(AC_SYSTEM_TYPE_META) as AcSystemType[]).map((type) => {
          const meta = AC_SYSTEM_TYPE_META[type];
          const href = meta.available ? `/projects/${projectId}/ac/new/${ROUTE[type]}` : null;
          const tile = (
            <Card
              className={`flex items-center justify-between p-4 ${
                href ? "active:bg-canvas hover:bg-canvas" : "opacity-50"
              }`}
            >
              <p className="text-[15px] font-semibold">{meta.label}</p>
              {!href ? (
                <span className="rounded-full bg-canvas px-2.5 py-1 text-[11px] font-medium text-muted">
                  Coming soon
                </span>
              ) : null}
            </Card>
          );
          return href ? (
            <Link key={type} href={href}>
              {tile}
            </Link>
          ) : (
            <div key={type}>{tile}</div>
          );
        })}
      </div>
    </div>
  );
}
