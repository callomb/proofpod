"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  createInviteAction,
  setProjectStatusAction,
  updateCompanyAction,
  updateProfileAction,
  updateTestProfileAction,
  type ActionResult,
} from "@/lib/actions";
import type { Company, ProjectOverview, TestProfile } from "@/lib/types";
import { Button, Card, Field, FormError, inputClass } from "./ui";

function SaveButton({ label = "Save" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function ProfileForm({ fullName }: { fullName: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(updateProfileAction, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Your name" hint="Used for “started by / completed by” on every test.">
        <input name="full_name" defaultValue={fullName} required className={inputClass} />
      </Field>
      {state.ok ? <p className="text-[13px] text-pass">Saved.</p> : null}
      <FormError>{state.error}</FormError>
      <SaveButton />
    </form>
  );
}

export function CompanyForm({ company }: { company: Company }) {
  const [state, action] = useActionState<ActionResult, FormData>(updateCompanyAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="company_id" value={company.id} />
      <Field label="Company name">
        <input name="name" required defaultValue={company.name} className={inputClass} />
      </Field>
      <Field label="Address line 1">
        <input name="address_line1" defaultValue={company.address_line1 ?? ""} className={inputClass} />
      </Field>
      <Field label="Address line 2">
        <input name="address_line2" defaultValue={company.address_line2 ?? ""} className={inputClass} />
      </Field>
      <div className="flex gap-3">
        <Field label="Town / city">
          <input name="city" defaultValue={company.city ?? ""} className={inputClass} />
        </Field>
        <Field label="Postcode">
          <input name="postcode" defaultValue={company.postcode ?? ""} className={inputClass} />
        </Field>
      </div>
      <Field label="Phone">
        <input name="phone" defaultValue={company.phone ?? ""} className={inputClass} />
      </Field>
      {state.ok ? <p className="text-[13px] text-pass">Saved.</p> : null}
      <FormError>{state.error}</FormError>
      <SaveButton label="Save company details" />
    </form>
  );
}

export function TestProfileForm({ profile }: { profile: TestProfile }) {
  const [state, action] = useActionState<ActionResult, FormData>(
    updateTestProfileAction,
    {},
  );
  const rows = [
    { key: "initial", label: "Initial test", p: profile.initial_pressure_bar, d: profile.initial_duration_min },
    { key: "strength", label: "Strength test", p: profile.strength_pressure_bar, d: profile.strength_duration_min },
    { key: "pressure", label: "Pressure test", p: profile.pressure_pressure_bar, d: profile.pressure_duration_min },
  ];
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="profile_id" value={profile.id} />
      {rows.map((r) => (
        <div key={r.key}>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">{r.label}</span>
          <div className="flex gap-2">
            <label className="flex-1">
              <input
                name={`${r.key}_pressure_bar`}
                type="number"
                step="0.1"
                min="0"
                defaultValue={r.p}
                className="w-full rounded-xl border border-line-strong px-3 py-2.5"
                aria-label={`${r.label} pressure`}
              />
              <span className="mt-1 block text-[11px] text-faint">bar</span>
            </label>
            <label className="flex-1">
              <input
                name={`${r.key}_duration_min`}
                type="number"
                step="1"
                min="0"
                defaultValue={r.d}
                className="w-full rounded-xl border border-line-strong px-3 py-2.5"
                aria-label={`${r.label} duration`}
              />
              <span className="mt-1 block text-[11px] text-faint">minutes</span>
            </label>
          </div>
        </div>
      ))}
      <p className="text-[12px] text-muted">
        Company defaults. New projects and tests start from these values. They&rsquo;re not a
        compliance standard.
      </p>
      {state.ok ? <p className="text-[13px] text-pass">Saved.</p> : null}
      <FormError>{state.error}</FormError>
      <SaveButton label="Save default values" />
    </form>
  );
}

export function InviteForm({ companyId }: { companyId: string }) {
  const [state, action] = useActionState<ActionResult & { link?: string }, FormData>(
    createInviteAction,
    {},
  );
  const [copied, setCopied] = useState(false);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="company_id" value={companyId} />
      <Field label="Invite a plumber" hint="Optional email — just for your records. Share the link however you like.">
        <input name="email" type="email" className={inputClass} placeholder="dave@company.co.uk" />
      </Field>
      <Button type="submit" variant="secondary" className="w-full">
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
  );
}

export function ReactivateButton({ project }: { project: ProjectOverview }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Card className="flex items-center justify-between p-4">
      <div>
        <p className="text-[15px] font-semibold">{project.name}</p>
        <p className="text-[12px] text-muted">
          {project.tests_total} test{project.tests_total === 1 ? "" : "s"}
        </p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await setProjectStatusAction(project.id, "active");
            router.refresh();
          })
        }
      >
        {pending ? "…" : "Reactivate"}
      </Button>
    </Card>
  );
}
