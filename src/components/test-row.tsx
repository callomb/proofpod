import Link from "next/link";

import { TEST_STATUS_META, floorLabel, systemLabel } from "@/lib/domain";
import type { PressureTest } from "@/lib/types";
import { StatusDot } from "./ui";

export function TestRow({ test }: { test: PressureTest }) {
  const meta = TEST_STATUS_META[test.status];
  return (
    <Link
      href={`/projects/${test.project_id}/tests/${test.id}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper px-3.5 py-3 active:bg-canvas"
    >
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium">
          {floorLabel(test.floor)} · {systemLabel(test)}
        </p>
        <p className="truncate text-[13px] text-muted">{test.area}</p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-muted">
        <StatusDot tone={meta.tone} />
        {meta.label}
      </span>
    </Link>
  );
}
