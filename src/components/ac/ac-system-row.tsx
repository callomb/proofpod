import Link from "next/link";

import { AC_SYSTEM_STATUS_META, manufacturerLabel } from "@/lib/ac/domain";
import type { AcSystem } from "@/lib/ac/types";
import { StatusDot } from "../ui";

export function AcSystemRow({ system, projectId }: { system: AcSystem; projectId: string }) {
  const meta = AC_SYSTEM_STATUS_META[system.status];
  return (
    <Link
      href={`/projects/${projectId}/ac/${system.id}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper px-3.5 py-3 active:bg-canvas hover:bg-canvas"
    >
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium">{system.system_ref}</p>
        <p className="truncate text-[13px] text-muted">
          {system.area_served}
          <span className="text-faint"> · {manufacturerLabel(system)} · {system.ref}</span>
        </p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-muted">
        <StatusDot tone={meta.tone} />
        {meta.label}
      </span>
    </Link>
  );
}
