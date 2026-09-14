"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  setProjectTestOverrideAction,
  updateProjectDetailsAction,
  type ActionResult,
} from "@/lib/actions";
import { formatBar, formatDuration } from "@/lib/domain";
import type { Project, TestProfile } from "@/lib/types";
import { Button, Card, Field, FormError, inputClass } from "@/components/ui";

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

const STAGE_ROWS = [
  { key: "initial", label: "Initial Test" },
  { key: "strength", label: "Strength Test" },
  { key: "pressure", label: "Pressure Test" },
] as const;

export function ProjectDetailsForm({ project }: { project: Project }) {
  const [state, action] = useActionState<ActionResult, FormData>(
    updateProjectDetailsAction,
    {},
  );
  return (
    <Card className="p-5">
      <form action={action} className="space-y-4">
        <input type="hidden" name="project_id" value={project.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name">
            <input name="name" required defaultValue={project.name} className={inputClass} />
          </Field>
          <Field label="Project number">
            <input
              name="project_number"
              defaultValue={project.project_number ?? ""}
              className={inputClass}
              placeholder="24-118"
            />
          </Field>
          <Field label="Client / main contractor">
            <input
              name="client_name"
              defaultValue={project.client_name ?? ""}
              className={inputClass}
              placeholder="Grosvenor Estates"
            />
          </Field>
          <Field label="Full site address">
            <input
              name="site_address"
              defaultValue={project.site_address ?? ""}
              className={inputClass}
              placeholder="12 Lisbon Street, London W1"
            />
          </Field>
        </div>
        {state.ok ? <p className="text-[13px] text-pass">Saved.</p> : null}
        <FormError>{state.error}</FormError>
        <Save label="Save project details" />
      </form>
    </Card>
  );
}

export function ProjectTestSettings({
  project,
  companyDefault,
}: {
  project: Project;
  companyDefault: TestProfile;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    setProjectTestOverrideAction,
    {},
  );
  const [enabled, setEnabled] = useState(project.override_test_profile);

  const val = (
    stage: (typeof STAGE_ROWS)[number]["key"],
    kind: "pressure_bar" | "duration_min",
  ): number => {
    const pKey = `${stage}_${kind}` as keyof Project;
    const projectVal = project[pKey] as number | null;
    if (project.override_test_profile && projectVal != null) return projectVal;
    return companyDefault[`${stage}_${kind}` as keyof TestProfile] as number;
  };

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[15px] font-semibold">Test settings</h3>
          <p className="mt-0.5 text-[13px] text-muted">
            New tests on this project start from these values. Individual tests can still
            be adjusted with the gear icon on the test screen.
          </p>
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2.5 text-[14px] font-medium">
        <input
          type="checkbox"
          name="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="size-4"
        />
        Override company defaults for this project
      </label>

      <form action={action} className="mt-4">
        <input type="hidden" name="project_id" value={project.id} />
        <input type="hidden" name="enabled" value={enabled ? "true" : "false"} />

        <div className="space-y-3">
          {STAGE_ROWS.map((row) => (
            <div
              key={row.key}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-3 last:border-0"
            >
              <span className="w-28 text-[13px] font-medium">{row.label}</span>
              {enabled ? (
                <div className="flex gap-2">
                  <label className="w-24">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      name={`${row.key}_pressure_bar`}
                      defaultValue={val(row.key, "pressure_bar")}
                      className="w-full rounded-lg border border-line-strong px-2.5 py-1.5 text-[14px]"
                      aria-label={`${row.label} pressure`}
                    />
                    <span className="mt-0.5 block text-[10px] text-faint">bar</span>
                  </label>
                  <label className="w-24">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      name={`${row.key}_duration_min`}
                      defaultValue={val(row.key, "duration_min")}
                      className="w-full rounded-lg border border-line-strong px-2.5 py-1.5 text-[14px]"
                      aria-label={`${row.label} duration`}
                    />
                    <span className="mt-0.5 block text-[10px] text-faint">minutes</span>
                  </label>
                </div>
              ) : (
                <span className="text-[13px] text-muted">
                  {formatBar(val(row.key, "pressure_bar"))} ·{" "}
                  {formatDuration(val(row.key, "duration_min"))}
                  <span className="text-faint"> (company default)</span>
                </span>
              )}
            </div>
          ))}
        </div>

        {state.ok ? <p className="mt-3 text-[13px] text-pass">Saved.</p> : null}
        <FormError>{state.error}</FormError>
        <div className="mt-4">
          <Save label="Save test settings" />
        </div>
      </form>
    </Card>
  );
}
