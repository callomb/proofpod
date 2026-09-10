"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";

import {
  signInAction,
  signUpAction,
  type ActionResult,
} from "@/lib/actions";
import { Button, Field, FormError, inputClass } from "./ui";

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "One moment…" : children}
    </Button>
  );
}

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(signInAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email">
        <input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          className={inputClass}
          placeholder="you@company.co.uk"
        />
      </Field>
      <Field label="Password">
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </Field>
      <FormError>{state.error}</FormError>
      <Submit>Sign in</Submit>
      <p className="text-center text-[13px] text-muted">
        New company?{" "}
        <Link href="/sign-up" className="font-medium text-ink underline underline-offset-2">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm({ invite }: { invite?: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(signUpAction, {});
  return (
    <form action={action} className="space-y-4">
      {invite ? <input type="hidden" name="invite" value={invite} /> : null}
      <Field label="Your name">
        <input
          name="full_name"
          autoComplete="name"
          required
          className={inputClass}
          placeholder="Dave Smith"
        />
      </Field>
      {!invite ? (
        <Field label="Company name">
          <input
            name="company_name"
            autoComplete="organization"
            required
            className={inputClass}
            placeholder="Smith Mechanical Ltd"
          />
        </Field>
      ) : (
        <p className="rounded-xl bg-canvas px-3.5 py-2.5 text-[13px] text-muted">
          You&rsquo;re joining an existing company via invite.
        </p>
      )}
      <Field label="Email">
        <input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          className={inputClass}
          placeholder="you@company.co.uk"
        />
      </Field>
      <Field label="Password" hint="At least 8 characters.">
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputClass}
        />
      </Field>
      <FormError>{state.error}</FormError>
      <Submit>{invite ? "Join company" : "Create account"}</Submit>
      <p className="text-center text-[13px] text-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-ink underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </form>
  );
}
