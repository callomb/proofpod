"use client";

import { useMemo, useState, useTransition } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  createProjectAction,
  setProjectStatusAction,
  type ActionResult,
} from "@/lib/actions";
import type { ProjectOverview } from "@/lib/types";
import { Sheet } from "@/components/app-shell";
import { Button, Card, Field, FormError, StatusDot, inputClass } from "@/components/ui";

function Counts({ p }: { p: ProjectOverview }) {
  const items: [("progress" | "pass" | "fail"), string][] = [];
  if (p.tests_in_progress) items.push(["progress", `${p.tests_in_progress} in progress`]);
  if (p.tests_passed) items.push(["pass", `${p.tests_passed} passed`]);
  if (p.tests_failed) items.push(["fail", `${p.tests_failed} failed`]);
  if (items.length === 0)
    return <span className="text-[12px] text-faint">No tests yet</span>;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
      {items.map(([tone, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <StatusDot tone={tone} />
          {label}
        </span>
      ))}
    </div>
  );
}

function RowMenu({ p, archived }: { p: ProjectOverview; archived: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        aria-label="Project options"
        className="grid size-8 place-items-center rounded-full text-muted hover:bg-canvas"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="5" r="1.6" fill="currentColor" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="19" r="1.6" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={(e) => { e.preventDefault(); setOpen(false); }} />
          <div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border border-line bg-paper py-1 shadow-pop">
            {!archived ? (
              <Link
                href={`/admin/projects/${p.id}?tab=details`}
                className="block px-3.5 py-2 text-[13px] hover:bg-canvas"
              >
                Edit project
              </Link>
            ) : null}
            <button
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                start(async () => {
                  await setProjectStatusAction(p.id, archived ? "active" : "archived");
                  setOpen(false);
                  router.refresh();
                });
              }}
              className="block w-full px-3.5 py-2 text-left text-[13px] hover:bg-canvas"
            >
              {archived ? "Reactivate project" : "Archive project"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ProjectRow({ p, archived }: { p: ProjectOverview; archived: boolean }) {
  return (
    <Card className="flex items-center justify-between gap-3 px-4 py-3.5">
      <Link href={`/admin/projects/${p.id}`} className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-semibold">{p.name}</p>
        <p className="truncate text-[12px] text-muted">
          {[p.project_number, p.client_name].filter(Boolean).join(" · ") || "No details yet"}
        </p>
        <div className="mt-1.5">
          <Counts p={p} />
        </div>
      </Link>
      <RowMenu p={p} archived={archived} />
    </Card>
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

export function AdminProjects({
  active,
  archived,
  companyId,
}: {
  active: ProjectOverview[];
  archived: ProjectOverview[];
  companyId: string;
}) {
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult, FormData>(createProjectAction, {});

  const list = tab === "active" ? active : archived;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.client_name ?? "").toLowerCase().includes(q) ||
        (p.project_number ?? "").toLowerCase().includes(q),
    );
  }, [list, query]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-[26px] font-semibold tracking-tight">Projects</h1>
        <Button onClick={() => setOpen(true)}>New project</Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-line bg-paper p-0.5">
          {(["active", "archived"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium capitalize ${
                tab === t ? "bg-ink text-paper" : "text-muted"
              }`}
            >
              {t} {t === "active" ? `(${active.length})` : `(${archived.length})`}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects"
          className={`${inputClass} h-9 max-w-[240px] py-1.5`}
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="px-5 py-12 text-center">
          <p className="text-[15px] font-medium">
            {query ? `Nothing matches “${query}”.` : `No ${tab} projects.`}
          </p>
        </Card>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {filtered.map((p) => (
            <ProjectRow key={p.id} p={p} archived={tab === "archived"} />
          ))}
        </div>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="New project">
        <form action={action} className="space-y-4">
          <input type="hidden" name="company_id" value={companyId} />
          <input type="hidden" name="redirect_base" value="/admin/projects" />
          <Field label="Project name" hint="You can add the rest of the details next.">
            <input name="name" autoFocus required className={inputClass} placeholder="Lisbon House" />
          </Field>
          <FormError>{state.error}</FormError>
          <CreateSubmit />
        </form>
      </Sheet>
    </div>
  );
}
