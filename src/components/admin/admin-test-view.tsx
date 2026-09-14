"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  adminUpdateTestAction,
  createRetestAction,
  voidTestAction,
} from "@/lib/actions";
import {
  FLOOR_OPTIONS,
  STAGE_META,
  STAGE_ORDER,
  SYSTEM_OPTIONS,
  TEST_STATUS_META,
  elapsedLabel,
  floorLabel,
  formatBar,
  formatDuration,
  systemLabel,
} from "@/lib/domain";
import { useMounted } from "@/lib/use-mounted";
import type { PressureTest, StageKey, SystemKind, TestStage } from "@/lib/types";
import { Sheet } from "@/components/app-shell";
import { Button, Card, FormError, StatusDot, inputClass } from "@/components/ui";

export interface AdminPhoto {
  id: string;
  kind: string;
  stage: StageKey | null;
  url: string | null;
  taken_at: string;
  taken_by_name: string;
}

interface Props {
  test: PressureTest;
  stages: TestStage[];
  photos: AdminPhoto[];
  memberNames: Record<string, string>;
  sourceRef: string | null;
  sourceId: string | null;
  retests: { id: string; ref: string; status: PressureTest["status"] }[];
}

function dt(iso: string | null, mounted: boolean) {
  if (!iso) return "—";
  if (!mounted) return "…";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminTestView({
  test,
  stages,
  photos,
  memberNames,
  sourceRef,
  sourceId,
  retests,
}: Props) {
  const router = useRouter();
  const mounted = useMounted();
  const [editOpen, setEditOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [busy, startBusy] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const statusMeta = TEST_STATUS_META[test.status];
  const ordered = STAGE_ORDER.map((k) => stages.find((s) => s.stage === k)).filter(
    Boolean,
  ) as TestStage[];
  const used = ordered.filter((s) => s.status !== "not_started");

  const targetFor = (s: TestStage) => {
    const p =
      s.target_pressure_bar ??
      (s.stage === "initial"
        ? test.initial_pressure_bar
        : s.stage === "strength"
          ? test.strength_pressure_bar
          : test.pressure_pressure_bar);
    const d =
      s.target_duration_min ??
      (s.stage === "initial"
        ? test.initial_duration_min
        : s.stage === "strength"
          ? test.strength_duration_min
          : test.pressure_duration_min);
    return { p: Number(p), d: Number(d) };
  };

  const doRetest = () =>
    startBusy(async () => {
      const res = await createRetestAction(test.id, "/admin/projects");
      if (res?.error) setErr(res.error);
    });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium text-muted">{test.ref}</p>
          <h1 className="text-[22px] font-semibold tracking-tight">
            {floorLabel(test.floor)} · {systemLabel(test)}
          </h1>
          <p className="text-[14px] text-muted">{test.area}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-[12px] font-medium">
              <StatusDot tone={statusMeta.tone} />
              {statusMeta.label}
            </span>
            {test.locked ? (
              <span className="rounded-full bg-canvas px-2.5 py-1 text-[12px] text-muted">
                Locked
              </span>
            ) : null}
            {sourceRef && sourceId ? (
              <Link
                href={`/admin/projects/${test.project_id}/tests/${sourceId}`}
                className="rounded-full bg-canvas px-2.5 py-1 text-[12px] text-muted underline underline-offset-2"
              >
                Retest of {sourceRef}
              </Link>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
          {test.status === "in_progress" ? (
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              Edit details
            </Button>
          ) : null}
          {test.status !== "void" ? (
            <Button variant="secondary" size="sm" onClick={doRetest} disabled={busy}>
              {busy ? "…" : "Retest"}
            </Button>
          ) : null}
        </div>
      </div>

      {test.status === "void" && test.void_reason ? (
        <p className="mb-4 rounded-xl bg-canvas px-3.5 py-2.5 text-[13px] text-muted">
          Voided: {test.void_reason}
        </p>
      ) : null}
      {err ? (
        <div className="mb-4">
          <FormError>{err}</FormError>
        </div>
      ) : null}

      {used.length === 0 ? (
        <Card className="px-5 py-8 text-center text-[13px] text-muted">
          No stages started yet.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden bg-canvas px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted sm:grid sm:grid-cols-[1.2fr_1fr_1.3fr_1.3fr_1.2fr]">
            <span>Stage</span>
            <span>Required</span>
            <span>Start</span>
            <span>End</span>
            <span>By</span>
          </div>
          {used.map((s) => {
            const { p, d } = targetFor(s);
            return (
              <div
                key={s.id}
                className="grid gap-1 border-t border-line px-4 py-3 text-[13px] first:border-0 sm:grid-cols-[1.2fr_1fr_1.3fr_1.3fr_1.2fr] sm:gap-2"
              >
                <span className="font-medium">{STAGE_META[s.stage].label}</span>
                <span className="text-muted">
                  {formatBar(p)} · min {formatDuration(d)}
                </span>
                <span className="text-muted">{dt(s.started_at, mounted)}</span>
                <span className="text-muted">
                  {dt(s.completed_at, mounted)}
                  {s.completed_at && s.started_at
                    ? ` (${elapsedLabel(s.started_at, s.completed_at)})`
                    : ""}
                </span>
                <span className="text-muted">
                  {s.started_by ? memberNames[s.started_by] ?? "Someone" : "—"}
                  {s.completed_by && s.completed_by !== s.started_by
                    ? ` → ${memberNames[s.completed_by] ?? "Someone"}`
                    : ""}
                </span>
              </div>
            );
          })}
        </Card>
      )}

      {photos.length > 0 ? (
        <div className="mt-6">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
            Evidence photographs
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((ph) =>
              ph.url ? (
                <a
                  key={ph.id}
                  href={ph.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ph.url}
                    alt={`${ph.kind} photo`}
                    className="aspect-[4/3] w-full rounded-lg border border-line object-cover"
                  />
                  <p className="mt-1 text-[11px] text-muted">
                    {ph.stage ? STAGE_META[ph.stage].label : "Evidence"} ·{" "}
                    {ph.kind === "start" ? "start" : ph.kind === "end" ? "end" : "photo"}
                  </p>
                </a>
              ) : null,
            )}
          </div>
        </div>
      ) : null}

      {retests.length > 0 ? (
        <div className="mt-6">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
            Retests
          </h2>
          <div className="space-y-1.5">
            {retests.map((r) => (
              <Link
                key={r.id}
                href={`/admin/projects/${test.project_id}/tests/${r.id}`}
                className="flex items-center justify-between rounded-xl border border-line bg-paper px-3.5 py-2.5 text-[13px]"
              >
                <span className="font-medium">{r.ref}</span>
                <span className="inline-flex items-center gap-1.5 text-muted">
                  <StatusDot tone={TEST_STATUS_META[r.status].tone} />
                  {TEST_STATUS_META[r.status].label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <dl className="mt-6 grid gap-2 border-t border-line pt-4 text-[12px] sm:grid-cols-2">
        <Row k="Test ID" v={test.ref} />
        <Row
          k="Created by"
          v={`${test.created_by ? memberNames[test.created_by] ?? "Someone" : "—"} · ${dt(test.created_at, mounted)}`}
        />
        {test.result_at ? (
          <Row
            k={test.status === "passed" ? "Passed by" : test.status === "failed" ? "Failed by" : "Result by"}
            v={`${test.result_by ? memberNames[test.result_by] ?? "Someone" : "—"} · ${dt(test.result_at, mounted)}`}
          />
        ) : null}
        <Row k="Evidence photos" v={String(photos.length)} />
      </dl>

      {test.status !== "void" ? (
        <button
          onClick={() => setVoidOpen(true)}
          className="mt-6 text-[12px] font-medium text-faint underline underline-offset-2"
        >
          Void this test
        </button>
      ) : null}

      <EditSheet
        test={test}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onDone={() => {
          setEditOpen(false);
          router.refresh();
        }}
      />

      <Sheet open={voidOpen} onClose={() => setVoidOpen(false)} title="Void this test">
        <p className="mb-4 text-[13px] text-muted">
          Kept for the audit trail, removed from normal use and from certificate selection.
          This can&rsquo;t be undone.
        </p>
        <form
          action={(fd) =>
            startBusy(async () => {
              const res = await voidTestAction({}, fd);
              if (res.error) setErr(res.error);
              else {
                setVoidOpen(false);
                router.refresh();
              }
            })
          }
          className="space-y-3"
        >
          <input type="hidden" name="test_id" value={test.id} />
          <input
            name="reason"
            placeholder="Reason (optional)"
            className={inputClass}
          />
          <Button type="submit" variant="danger" size="lg" className="w-full" disabled={busy}>
            {busy ? "Voiding…" : "Void test"}
          </Button>
        </form>
      </Sheet>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 sm:block">
      <dt className="text-faint">{k}</dt>
      <dd className="text-right text-muted sm:text-left" suppressHydrationWarning>
        {v}
      </dd>
    </div>
  );
}

function EditSheet({
  test,
  open,
  onClose,
  onDone,
}: {
  test: PressureTest;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [system, setSystem] = useState<SystemKind>(test.system);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Sheet open={open} onClose={onClose} title="Correct test details">
      <p className="mb-4 text-[13px] text-muted">
        Fix identifying details on an in-progress test (e.g. a typo in the area). The
        evidence and timings are unchanged.
      </p>
      <form
        action={(fd) =>
          start(async () => {
            const res = await adminUpdateTestAction({}, fd);
            if (res.error) setError(res.error);
            else {
              setError(null);
              onDone();
            }
          })
        }
        className="space-y-4"
      >
        <input type="hidden" name="test_id" value={test.id} />
        <input type="hidden" name="project_id" value={test.project_id} />
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Floor</span>
          <select name="floor" defaultValue={test.floor} className={inputClass}>
            {FLOOR_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {floorLabel(f)}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">System</span>
          <div className="grid grid-cols-3 gap-2">
            {SYSTEM_OPTIONS.map((o) => (
              <label
                key={o.value}
                className={`cursor-pointer rounded-xl border px-3 py-2 text-center text-[13px] font-medium ${
                  system === o.value
                    ? "border-ink bg-ink text-paper"
                    : "border-line-strong text-ink-soft"
                }`}
              >
                <input
                  type="radio"
                  name="system"
                  value={o.value}
                  checked={system === o.value}
                  onChange={() => setSystem(o.value)}
                  className="sr-only"
                />
                {o.label}
              </label>
            ))}
          </div>
        </div>
        {system === "other" ? (
          <input
            name="system_other"
            defaultValue={test.system_other ?? ""}
            placeholder="System name"
            className={inputClass}
          />
        ) : null}
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Area</span>
          <input name="area" defaultValue={test.area} required className={inputClass} />
        </label>
        <FormError>{error}</FormError>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </Sheet>
  );
}
