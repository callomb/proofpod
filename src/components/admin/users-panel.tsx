"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createInviteAction,
  setMemberRoleAction,
  setMemberStatusAction,
  type ActionResult,
} from "@/lib/actions";
import { initials } from "@/lib/domain";
import { Button, Card, Field, FormError, StatusDot, inputClass } from "@/components/ui";

export interface MemberView {
  user_id: string;
  full_name: string;
  email: string | null;
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

  const run = (fn: () => Promise<ActionResult>) =>
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
          <p className="truncate text-[12px] text-muted">{m.email}</p>
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
    </Card>
  );
}

function InvitePanel({ companyId }: { companyId: string }) {
  const [state, action] = useActionState<ActionResult & { link?: string }, FormData>(
    createInviteAction,
    {},
  );
  const [copied, setCopied] = useState(false);

  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold">Invite a user</h3>
      <p className="mt-0.5 text-[13px] text-muted">
        Creates a link. Send it however you like — the person sets their own password.
      </p>
      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="company_id" value={companyId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input name="full_name" className={inputClass} placeholder="Dave Smith" />
          </Field>
          <Field label="Email (optional)">
            <input name="email" type="email" className={inputClass} placeholder="dave@…" />
          </Field>
        </div>
        <Field label="Role">
          <select name="role" defaultValue="member" className={inputClass}>
            <option value="member">Site user</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <Button type="submit" variant="secondary" className="w-full sm:w-auto">
          Create invite link
        </Button>
        <FormError>{state.error}</FormError>
        {state.link ? (
          <div className="rounded-xl bg-canvas p-3">
            <p className="mb-1 text-[12px] font-medium text-ink-soft">Invite link</p>
            <p className="break-all text-[12px] text-muted">{state.link}</p>
            <button
              type="button"
              className="mt-2 text-[12px] font-semibold underline underline-offset-2"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.link!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  /* clipboard blocked */
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        ) : null}
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
        <InvitePanel companyId={companyId} />
      </div>
    </div>
  );
}
