"use client";

import { useMounted } from "@/lib/use-mounted";

export interface ActivityView {
  lastSignIn: string | null;
  signIns: number;
  lastActive: string | null;
}

function fmt(iso: string | null, mounted: boolean) {
  if (!iso) return "never";
  if (!mounted) return "…";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityLine({
  activity,
  trackingSince,
}: {
  activity?: ActivityView;
  trackingSince: string;
}) {
  const mounted = useMounted();
  if (!activity) return null;
  const since = new Date(trackingSince).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
  return (
    <dl className="mt-2 space-y-0.5 text-[12px] text-muted" suppressHydrationWarning>
      <div className="flex justify-between gap-3">
        <dt>Last sign-in</dt>
        <dd suppressHydrationWarning>{fmt(activity.lastSignIn, mounted)}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt>Last active</dt>
        <dd suppressHydrationWarning>{fmt(activity.lastActive, mounted)}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt>Sign-ins since {since}</dt>
        <dd>{activity.signIns}</dd>
      </div>
    </dl>
  );
}
