import Link from "next/link";

import type { AcPressureTest } from "@/lib/ac/types";
import { StatusDot } from "../ui";

function statusMeta(test: AcPressureTest): { label: string; tone: "pass" | "progress" | "fail" } {
  if (test.status === "passed") return { label: "Passed", tone: "pass" };
  if (test.status === "failed") return { label: "Failed — retest", tone: "fail" };
  return { label: "In progress", tone: "progress" };
}

export function StandaloneAcPressureTestRow({
  test,
  projectId,
}: {
  test: AcPressureTest;
  projectId: string;
}) {
  const meta = statusMeta(test);
  return (
    <Link href={`/projects/${projectId}/ac/pressure-tests/${test.lineage_id}`}>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper px-3.5 py-3 active:bg-canvas hover:bg-canvas">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium">{test.reference}</p>
          <p className="truncate text-[13px] text-muted">
            Pressure Test <span className="text-faint">· {test.ref}</span>
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-muted">
          <StatusDot tone={meta.tone} />
          {meta.label}
        </span>
      </div>
    </Link>
  );
}
