"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createCompanyWithAdminAction, type ProvisionActionResult } from "@/lib/platform-actions";
import { generatePassword } from "@/lib/domain";
import type { CompanyOverview } from "@/lib/platform";
import { Sheet } from "@/components/app-shell";
import { Button, Card, Field, FormError, inputClass } from "@/components/ui";
import { CredentialsPanel } from "./credentials-panel";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Creating…" : "Create company"}
    </Button>
  );
}

function NewCompanySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [state, action] = useActionState<ProvisionActionResult, FormData>(
    createCompanyWithAdminAction,
    {},
  );
  const [password, setPassword] = useState(generatePassword());

  if (state.ok && state.username && state.password) {
    return (
      <Sheet
        open={open}
        onClose={() => {
          onClose();
          router.refresh();
        }}
        title="Company created"
      >
        <CredentialsPanel username={state.username} password={state.password} />
        <Button
          className="mt-4 w-full"
          onClick={() => {
            onClose();
            router.refresh();
          }}
        >
          Done
        </Button>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title="New company">
      <form action={action} className="space-y-4">
        <Field label="Company name">
          <input name="company_name" required autoFocus className={inputClass} placeholder="Smith Mechanical Ltd" />
        </Field>
        <div className="border-t border-line pt-4">
          <p className="mb-3 text-[13px] font-medium text-ink-soft">Their admin login</p>
          <div className="space-y-4">
            <Field label="Admin's name">
              <input name="admin_name" required className={inputClass} placeholder="Dave Smith" />
            </Field>
            <Field label="Username" hint="Lowercase letters, numbers, dots, dashes. No email needed.">
              <input name="username" required className={inputClass} placeholder="davesmith" />
            </Field>
            <Field label="Password">
              <div className="flex gap-2">
                <input
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setPassword(generatePassword())}
                >
                  New
                </Button>
              </div>
            </Field>
          </div>
        </div>
        <FormError>{state.error}</FormError>
        <Submit />
      </form>
    </Sheet>
  );
}

export function CompaniesPanel({ companies }: { companies: CompanyOverview[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-[26px] font-semibold tracking-tight">Companies</h1>
        <Button onClick={() => setOpen(true)}>New company</Button>
      </div>

      {companies.length === 0 ? (
        <Card className="px-5 py-12 text-center text-[13px] text-muted">No companies yet.</Card>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {companies.map((c) => (
            <Link key={c.id} href={`/platform/companies/${c.id}`}>
              <Card className="p-4 transition-colors hover:bg-canvas">
                <p className="text-[16px] font-semibold">{c.name}</p>
                <p className="mt-1 text-[12px] text-muted">
                  {c.member_count} user{c.member_count === 1 ? "" : "s"} · {c.project_count} project
                  {c.project_count === 1 ? "" : "s"} · since {fmtDate(c.created_at)}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <NewCompanySheet open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
