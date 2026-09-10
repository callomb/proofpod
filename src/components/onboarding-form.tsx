"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  acceptInviteAction,
  createCompanyAction,
  type ActionResult,
} from "@/lib/actions";
import { Button, Field, FormError, inputClass } from "./ui";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "One moment…" : label}
    </Button>
  );
}

export function OnboardingForm({
  fullName,
  invite,
}: {
  fullName: string;
  invite?: string;
}) {
  const [companyState, companyAction] = useActionState<ActionResult, FormData>(
    createCompanyAction,
    {},
  );
  const [inviteState, inviteAction] = useActionState<ActionResult, FormData>(
    acceptInviteAction,
    {},
  );

  if (invite) {
    return (
      <form action={inviteAction} className="space-y-4">
        <input type="hidden" name="invite" value={invite} />
        <Field label="Your name">
          <input
            name="full_name"
            defaultValue={fullName}
            required
            className={inputClass}
          />
        </Field>
        <FormError>{inviteState.error}</FormError>
        <Submit label="Join company" />
      </form>
    );
  }

  return (
    <form action={companyAction} className="space-y-4">
      <Field label="Your name">
        <input name="full_name" defaultValue={fullName} required className={inputClass} />
      </Field>
      <Field label="Company name" hint="You can add address and logo later.">
        <input
          name="company_name"
          required
          autoFocus
          className={inputClass}
          placeholder="Smith Mechanical Ltd"
        />
      </Field>
      <FormError>{companyState.error}</FormError>
      <Submit label="Create company" />
    </form>
  );
}
