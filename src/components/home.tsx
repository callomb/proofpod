"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";

import { createProjectAction, type ActionResult } from "@/lib/actions";
import { timeOfDay } from "@/lib/domain";
import { useMounted } from "@/lib/use-mounted";
import type { ProjectOverview } from "@/lib/types";
import { Sheet } from "./app-shell";
import { Button, Card, Field, FormError, StatusDot, inputClass } from "./ui";

export function GreetingLine({ firstName }: { firstName: string }) {
  const mounted = useMounted();
  const greeting = mounted ? `Good ${timeOfDay(new Date())}` : "Hello";
  return (
    <h1 className="text-[26px] font-semibold tracking-tight" suppressHydrationWarning>
      {greeting}, {firstName}
    </h1>
  );
}

function CountBits({ p }: { p: ProjectOverview }) {
  const bits: { tone: "progress" | "pass" | "fail"; label: string }[] = [];
  if (p.tests_in_progress) bits.push({ tone: "progress", label: `${p.tests_in_progress} in progress` });
  if (p.tests_passed) bits.push({ tone: "pass", label: `${p.tests_passed} passed` });
  if (p.tests_failed) bits.push({ tone: "fail", label: `${p.tests_failed} failed` });

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
      <span className="font-medium text-ink-soft">
        {p.tests_total} test{p.tests_total === 1 ? "" : "s"}
      </span>
      {bits.map((b) => (
        <span key={b.label} className="inline-flex items-center gap-1.5">
          <StatusDot tone={b.tone} />
          {b.label}
        </span>
      ))}
    </div>
  );
}

export function ProjectCard({ p }: { p: ProjectOverview }) {
  return (
    <Link href={`/projects/${p.id}`} className="block">
      <Card className="px-4 py-4 transition-colors active:bg-canvas">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[17px] font-semibold">{p.name}</p>
            {p.client_name ? (
              <p className="truncate text-[13px] text-muted">{p.client_name}</p>
            ) : null}
          </div>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            className="mt-1 shrink-0 text-faint"
            aria-hidden
          >
            <path
              d="M9 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        {p.tests_total > 0 ? (
          <CountBits p={p} />
        ) : (
          <p className="mt-2 text-[13px] text-faint">No tests yet</p>
        )}
      </Card>
    </Link>
  );
}

function CreateSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Creating…" : "Create project"}
    </Button>
  );
}

export function ProjectList({
  projects,
  companyId,
}: {
  projects: ProjectOverview[];
  companyId: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult, FormData>(createProjectAction, {});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.client_name ?? "").toLowerCase().includes(q) ||
        (p.project_number ?? "").toLowerCase().includes(q),
    );
  }, [projects, query]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects"
          className={`${inputClass} py-2.5`}
          aria-label="Search projects"
        />
        <button
          onClick={() => setOpen(true)}
          aria-label="New project"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink text-paper"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {projects.length === 0 ? (
        <Card className="px-5 py-10 text-center">
          <p className="text-[15px] font-medium">No active projects yet</p>
          <p className="mt-1 text-[13px] text-muted">
            Create one to start recording pressure tests.
          </p>
          <Button onClick={() => setOpen(true)} className="mt-4">
            New project
          </Button>
        </Card>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted">
          Nothing matches &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="New project">
        <form action={action} className="space-y-4">
          <input type="hidden" name="company_id" value={companyId} />
          <Field label="Project name" hint="That's all you need. Details can be added later.">
            <input
              name="name"
              autoFocus
              required
              className={inputClass}
              placeholder="Lisbon House"
            />
          </Field>
          <FormError>{state.error}</FormError>
          <CreateSubmit />
        </form>
      </Sheet>
    </div>
  );
}
