"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  platformResetPasswordAction,
  platformSetMemberStatusAction,
} from "@/lib/platform-actions";
import { initials } from "@/lib/domain";
import { roleLabel } from "@/lib/types";
import type { MemberWithProfile } from "@/lib/platform";
import { Button, Card, StatusDot } from "@/components/ui";
import { Sheet } from "@/components/app-shell";
import { ActivityLine, type ActivityView } from "@/components/activity-line";
import { CredentialsPanel } from "./credentials-panel";

function MemberCard({
  m,
  companyId,
  activity,
  trackingSince,
}: {
  m: MemberWithProfile;
  companyId: string;
  activity?: ActivityView;
  trackingSince: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState<string | null>(null);

  const active = m.membership.status === "active";

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-canvas text-[12px] font-semibold">
          {initials(m.profile.full_name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">{m.profile.full_name || "Pending"}</p>
          <p className="truncate text-[12px] text-muted">
            {m.profile.username ? `@${m.profile.username}` : m.email}
          </p>
          <div className="mt-1.5 flex items-center gap-3 text-[12px]">
            <span className="inline-flex items-center gap-1.5">
              <StatusDot tone={active ? "pass" : "void"} />
              {active ? "Active" : "Deactivated"}
            </span>
            <span className="text-muted">{roleLabel(m.membership.role)}</span>
          </div>
        </div>
      </div>

      <ActivityLine activity={activity} trackingSince={trackingSince} />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await platformResetPasswordAction(m.membership.user_id);
              if (res.error) setError(res.error);
              else if (res.password) setResetPassword(res.password);
            })
          }
        >
          Reset password
        </Button>
        <Button
          variant={active ? "danger" : "secondary"}
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await platformSetMemberStatusAction(
                companyId,
                m.membership.user_id,
                active ? "inactive" : "active",
              );
              if (res.error) setError(res.error);
              else router.refresh();
            })
          }
        >
          {active ? "Deactivate" : "Reactivate"}
        </Button>
      </div>
      {error ? <p className="mt-2 text-[12px] text-fail">{error}</p> : null}

      <Sheet
        open={resetPassword !== null}
        onClose={() => {
          setResetPassword(null);
          router.refresh();
        }}
        title="New password"
      >
        {resetPassword ? (
          <CredentialsPanel
            username={m.profile.username ?? undefined}
            password={resetPassword}
          />
        ) : null}
      </Sheet>
    </Card>
  );
}

export function CompanyDetail({
  companyId,
  companyName,
  members,
  projectCount,
  activity,
  trackingSince,
}: {
  companyId: string;
  companyName: string;
  members: MemberWithProfile[];
  projectCount: number;
  activity: Record<string, ActivityView>;
  trackingSince: string;
}) {
  return (
    <div>
      <h1 className="text-[26px] font-semibold tracking-tight">{companyName}</h1>
      <p className="mb-6 mt-1 text-[13px] text-muted">
        {members.length} user{members.length === 1 ? "" : "s"} · {projectCount} project
        {projectCount === 1 ? "" : "s"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {members.map((m) => (
          <MemberCard
            key={m.membership.user_id}
            m={m}
            companyId={companyId}
            activity={activity[m.membership.user_id]}
            trackingSince={trackingSince}
          />
        ))}
      </div>
    </div>
  );
}
