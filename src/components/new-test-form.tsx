"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { createTestAction, type ActionResult } from "@/lib/actions";
import { DEFAULT_FLOOR, FLOOR_OPTIONS, SYSTEM_OPTIONS, floorLabel } from "@/lib/domain";
import type { SystemKind } from "@/lib/types";
import { Button, Field, FormError, inputClass } from "./ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Creating…" : "Create test"}
    </Button>
  );
}

export function NewTestForm({
  projectId,
  redirectBase = "/projects",
}: {
  projectId: string;
  redirectBase?: string;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(createTestAction, {});
  const [system, setSystem] = useState<SystemKind>("cold");
  const [clientError, setClientError] = useState<string | null>(null);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const area = new FormData(e.currentTarget).get("area");
        if (!String(area ?? "").trim()) {
          e.preventDefault();
          setClientError("Enter the area being tested.");
          return;
        }
        setClientError(null);
      }}
      className="space-y-5"
    >
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="redirect_base" value={redirectBase} />

      <Field label="Floor">
        <select name="floor" defaultValue={DEFAULT_FLOOR} className={inputClass}>
          {FLOOR_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {floorLabel(f)}
            </option>
          ))}
        </select>
      </Field>

      <div>
        <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">System</span>
        <div className="grid grid-cols-3 gap-2">
          {SYSTEM_OPTIONS.map((s) => (
            <label
              key={s.value}
              className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center text-[14px] font-medium ${
                system === s.value
                  ? "border-ink bg-ink text-paper"
                  : "border-line-strong bg-paper text-ink-soft"
              }`}
            >
              <input
                type="radio"
                name="system"
                value={s.value}
                checked={system === s.value}
                onChange={() => setSystem(s.value)}
                className="sr-only"
              />
              {s.label}
            </label>
          ))}
        </div>
      </div>

      {system === "other" ? (
        <Field label="System name">
          <input
            name="system_other"
            className={inputClass}
            placeholder="e.g. Chilled water"
            autoFocus
          />
        </Field>
      ) : null}

      <Field label="Area" required hint="Required — wherever you're testing.">
        <input
          name="area"
          required
          aria-required="true"
          className={inputClass}
          placeholder="Male WCs"
          autoComplete="off"
        />
      </Field>

      <FormError>{clientError ?? state.error}</FormError>
      <Submit />
    </form>
  );
}
