"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  updateCompanyAction,
  updateProfileAction,
  updateTestProfileAction,
  type ActionResult,
} from "@/lib/actions";
import type { Company, TestProfile } from "@/lib/types";
import { Button, Field, FormError, inputClass } from "./ui";

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
      <label className="flex items-start gap-2.5 text-[14px]">
        <input
          type="checkbox"
          name="show_all_stages"
          defaultChecked={profile.show_all_stages}
          className="mt-0.5 size-4"
        />
        <span>
          Show Initial &amp; Strength tests on new tests
          <span className="block text-[12px] text-muted">
            Off = site users only see the Pressure Test. They can still switch the others on
            for an individual test from its gear icon.
          </span>
        </span>
      </label>
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

