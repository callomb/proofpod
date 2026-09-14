"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { changeOwnPasswordAction } from "@/lib/staff-actions";
import type { ProvisionActionResult } from "@/lib/platform-actions";
import { Button, Field, FormError, inputClass } from "./ui";

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Saving…" : "Change password"}
    </Button>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState<ProvisionActionResult, FormData>(
    changeOwnPasswordAction,
    {},
  );
  return (
    <form action={action} className="space-y-4">
      <Field label="New password" hint="At least 8 characters.">
        <input
          name="new_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputClass}
        />
      </Field>
      <Field label="Confirm new password">
        <input
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputClass}
        />
      </Field>
      {state.ok ? <p className="text-[13px] text-pass">Password changed.</p> : null}
      <FormError>{state.error}</FormError>
      <Save />
    </form>
  );
}
