"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setMemberRoleAction, setMemberStatusAction, type ActionResult } from "@/lib/actions";
import {
  createStaffAction,
  resetStaffPasswordAction,
  type ProvisionActionResult,
} from "@/lib/staff-actions";
import { generatePassword, initials } from "@/lib/domain";
import { Button, Card, Field, FormError, StatusDot, inputClass } from "@/components/ui";
import { Sheet } from "@/components/app-shell";
import { CredentialsPanel } from "@/components/platform/credentials-panel";

export interface MemberView {
  user_id: string;
  full_name: string;
  username: string | null;
  role: "admin" | "member";
  status: "active" | "inactive";
}

function MemberCard({
  m,
  companyId,
  isSelf,
}: {
  m: MemberView;
  companyId: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState<string | null>(null);

  const run = (fn: () => Promise<ActionResult | ProvisionActionResult>) =>
    start(async () => {
      const res = await fn();
      if (res.error) setErr(res.error);
      else {
        setErr(null);
        router.refresh();
      }
    });

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${
            m.status === "inactive" ? "bg-canvas text-faint" : "bg-canvas text-ink"
          }`}
        >
          {initials(m.full_name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">
            {m.full_name || "Pending"}
            {isSelf ? <span className="text-faint"> · you</span> : null}
          </p>
          <p className="truncate text-[12px] text-muted">
            {m.username ? `@${m.username}` : "—"}
          </p>
          <div className="mt-1.5 flex items-center gap-3 text-[12px]">
            <span className="inline-flex items-center gap-1.5">
              <StatusDot tone={m.status === "active" ? "pass" : "void"} />
              {m.status === "active" ? "Active" : "Deactivated"}
            </span>
            <span className="text-muted">{m.role === "admin" ? "Admin" : "Site user"}</span>
          </div>
        </div>
      </div>

      {!isSelf ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await resetStaffPasswordAction(companyId, m.user_id);
                if (res.error) setErr(res.error);
                else if (res.password) setResetPassword(res.password);
              })
            }
          >
            Reset password
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(() =>
                setMemberRoleAction(
                  companyId,
                  m.user_id,
                  m.role === "admin" ? "member" : "admin",
                ),
              )
            }
          >
            Make {m.role === "admin" ? "site user" : "admin"}
          </Button>
          <Button
            variant={m.status === "active" ? "danger" : "secondary"}
            size="sm"
            disabled={pending}
            onClick={() =>
              run(() =>
                setMemberStatusAction(
                  companyId,
                  m.user_id,
                  m.status === "active" ? "inactive" : "active",
                ),
              )
            }
          >
            {m.status === "active" ? "Deactivate" : "Reactivate"}
          </Button>
        </div>
      ) : null}
      {err ? <p className="mt-2 text-[12px] text-fail">{err}</p> : null}

      <Sheet
        open={resetPassword !== null}
        onClose={() => {
          setResetPassword(null);
          router.refresh();
        }}
        title="New password"
      >
        {resetPassword ? (
          <CredentialsPanel username={m.username ?? undefined} password={resetPassword} />
        ) : null}
      </Sheet>
    </Card>
  );
}

function Submit() {
  return (
    <Button type="submit" variant="secondary" className="w-full sm:w-auto">
      Add user
    </Button>
  );
}

function AddStaffPanel({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [state, action] = useActionState<ProvisionActionResult, FormData>(createStaffAction, {});
  const [password, setPassword] = useState(generatePassword());

  if (state.ok && state.username && state.password) {
    return (
      <Card className="p-5">
        <h3 className="mb-3 text-[15px] font-semibold">User added</h3>
        <CredentialsPanel username={state.username} password={state.password} />
        <Button
          className="mt-4 w-full sm:w-auto"
          onClick={() => {
            router.refresh();
            setPassword(generatePassword());
          }}
        >
          Add another
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold">Add a user</h3>
      <p className="mt-0.5 text-[13px] text-muted">
        Pick a username and password for them — no email needed. Hand the details over directly.
      </p>
      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="company_id" value={companyId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input name="full_name" required className={inputClass} placeholder="Dave Smith" />
          </Field>
          <Field label="Username">
            <input name="username" required className={inputClass} placeholder="davesmith" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Password">
            <div className="flex gap-2">
              <input
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
              <Button type="button" variant="secondary" onClick={() => setPassword(generatePassword())}>
                New
              </Button>
            </div>
          </Field>
          <Field label="Role">
            <select name="role" defaultValue="member" className={inputClass}>
              <option value="member">Site user</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
        </div>
        <FormError>{state.error}</FormError>
        <Submit />
      </form>
    </Card>
  );
}

export function UsersPanel({
  members,
  companyId,
  currentUserId,
}: {
  members: MemberView[];
  companyId: string;
  currentUserId: string;
}) {
  return (
    <div>
      <h1 className="mb-6 text-[26px] font-semibold tracking-tight">Users</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {members.map((m) => (
          <MemberCard
            key={m.user_id}
            m={m}
            companyId={companyId}
            isSelf={m.user_id === currentUserId}
          />
        ))}
      </div>
      <div className="mt-8">
        <AddStaffPanel companyId={companyId} />
      </div>
    </div>
  );
}
