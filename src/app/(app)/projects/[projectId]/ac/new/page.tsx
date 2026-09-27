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

function Tile({ href, label, hint }: { href: string | null; label: string; hint?: string }) {
  const card = (
    <Card
      className={`flex items-center justify-between p-4 ${
        href ? "active:bg-canvas hover:bg-canvas" : "opacity-50"
      }`}
    >
      <div>
        <p className="text-[15px] font-semibold">{label}</p>
        {hint ? <p className="mt-0.5 text-[13px] text-muted">{hint}</p> : null}
      </div>
      {!href ? (
        <span className="rounded-full bg-canvas px-2.5 py-1 text-[11px] font-medium text-muted">
          Coming soon
        </span>
      ) : null}
    </Card>
  );
  return href ? <Link href={href}>{card}</Link> : <div>{card}</div>;
}

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
      <h1 className="mb-6 text-[24px] font-semibold tracking-tight">New AC system or test</h1>

      <p className="mb-2.5 text-[13px] font-medium text-ink-soft">Systems</p>
      <div className="mb-6 space-y-2.5">
        {(Object.keys(AC_SYSTEM_TYPE_META) as AcSystemType[]).map((type) => {
          const meta = AC_SYSTEM_TYPE_META[type];
          return (
            <Tile
              key={type}
              label={meta.label}
              href={meta.available ? `/projects/${projectId}/ac/new/${ROUTE[type]}` : null}
            />
          );
        })}
      </div>

      <p className="mb-2.5 text-[13px] font-medium text-ink-soft">Standalone tests</p>
      <div className="space-y-2.5">
        <Tile
          label="Pressure Test"
          hint="Just a leak test — no full system record needed"
          href={`/projects/${projectId}/ac/pressure-tests/new`}
        />
      </div>
    </div>
  );
}
