"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  setProjectStatusAction,
  updateProjectMetaAction,
  type ActionResult,
} from "@/lib/actions";
import type { Project } from "@/lib/types";
import { Button, Field, FormError, inputClass } from "./ui";

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Saving…" : "Save details"}
    </Button>
  );
}

export function ProjectEditForm({ project }: { project: Project }) {
  const router = useRouter();
  const [state, action] = useActionState<ActionResult, FormData>(
    updateProjectMetaAction,
    {},
  );
  const [pending, start] = useTransition();
  const [statusError, setStatusError] = useState<string | null>(null);

  const toggleStatus = () => {
    const next = project.status === "active" ? "archived" : "active";
    start(async () => {
      const res = await setProjectStatusAction(project.id, next);
      if (res.error) setStatusError(res.error);
      else if (next === "archived") router.push("/home");
      else router.refresh();
    });
  };

  return (
    <div className="space-y-8">
      <form action={action} className="space-y-4">
        <input type="hidden" name="project_id" value={project.id} />
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
        <Field label="Client">
          <input
            name="client_name"
            defaultValue={project.client_name ?? ""}
            className={inputClass}
            placeholder="Grosvenor Estates"
          />
        </Field>
        <Field label="Full site address">
          <textarea
            name="site_address"
            defaultValue={project.site_address ?? ""}
            rows={3}
            className={inputClass}
            placeholder="12 Lisbon Street, London W1"
          />
        </Field>
        {state.ok ? <p className="text-[13px] text-pass">Saved.</p> : null}
        <FormError>{state.error}</FormError>
        <Save />
      </form>

      <div className="border-t border-line pt-6">
        <p className="text-[14px] font-semibold">
          {project.status === "active" ? "Archive project" : "Reactivate project"}
        </p>
        <p className="mt-1 text-[13px] text-muted">
          {project.status === "active"
            ? "Hides it from the project list. Nothing is deleted — it stays viewable and can be reactivated."
            : "Move it back into the active project list."}
        </p>
        <Button
          variant="secondary"
          className="mt-3 w-full"
          onClick={toggleStatus}
          disabled={pending}
        >
          {pending
            ? "Working…"
            : project.status === "active"
              ? "Archive project"
              : "Reactivate project"}
        </Button>
        {statusError ? <p className="mt-2 text-[12px] text-fail">{statusError}</p> : null}
      </div>
    </div>
  );
}
