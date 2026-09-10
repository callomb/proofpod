"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  completeStageAction,
  createRetestAction,
  recordPhotoAction,
  setTestResultAction,
  startStageAction,
  updateTestSettingsAction,
  voidTestAction,
  type ActionResult,
} from "@/lib/actions";
import {
  STAGE_META,
  STAGE_ORDER,
  TEST_STATUS_META,
  elapsedLabel,
  floorLabel,
  formatBar,
  formatDuration,
  stageRequiresPhotos,
  stageTargets,
  systemLabel,
} from "@/lib/domain";
import type { PressureTest, StageKey, TestStage } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { Sheet } from "./app-shell";
import { Button, Card, FormError, Muted, StatusDot } from "./ui";

export interface PhotoView {
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
  photos: PhotoView[];
  memberNames: Record<string, string>;
  companyId: string;
  projectName: string;
  sourceRef: string | null;
  sourceId: string | null;
  retests: { id: string; ref: string; status: PressureTest["status"] }[];
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function uploadEvidence(
  file: File,
  opts: { companyId: string; projectId: string; testId: string },
): Promise<string> {
  const supabase = createClient();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${opts.companyId}/${opts.projectId}/${opts.testId}/${crypto.randomUUID()}.${ext || "jpg"}`;
  const { error } = await supabase.storage
    .from("evidence")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

// ---------------------------------------------------------------------------
// Stage card
// ---------------------------------------------------------------------------
function StageCard({
  test,
  stage,
  photos,
  companyId,
  memberNames,
  locked,
}: {
  test: PressureTest;
  stage: TestStage;
  photos: PhotoView[];
  companyId: string;
  memberNames: Record<string, string>;
  locked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "start" | "complete">(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingKind = useRef<"start" | "end">("start");

  const meta = STAGE_META[stage.stage];
  const targets =
    stage.status === "not_started"
      ? stageTargets(test, stage.stage)
      : {
          pressure: Number(stage.target_pressure_bar ?? stageTargets(test, stage.stage).pressure),
          duration: Number(stage.target_duration_min ?? stageTargets(test, stage.stage).duration),
        };
  const needsPhoto = stageRequiresPhotos(stage.stage);

  const run = async (fn: () => Promise<ActionResult>, kind: "start" | "complete") => {
    setBusy(kind);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (res.error) setError(res.error);
    else router.refresh();
  };

  const handleAction = async (kind: "start" | "complete") => {
    if (needsPhoto) {
      pendingKind.current = kind === "start" ? "start" : "end";
      fileRef.current?.click();
      return;
    }
    if (kind === "start") await run(() => startStageAction(stage.id), "start");
    else await run(() => completeStageAction(stage.id), "complete");
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const kind = pendingKind.current;
    const actionKind = kind === "start" ? "start" : "complete";
    setBusy(actionKind);
    setError(null);
    try {
      const path = await uploadEvidence(file, {
        companyId,
        projectId: test.project_id,
        testId: test.id,
      });
      const rec = await recordPhotoAction({
        testId: test.id,
        storagePath: path,
        kind,
        stageId: stage.id,
        mime: file.type,
        sizeBytes: file.size,
      });
      if (rec.error) throw new Error(rec.error);
      const res =
        kind === "start"
          ? await startStageAction(stage.id)
          : await completeStageAction(stage.id);
      if (res.error) throw new Error(res.error);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const stagePhotos = photos.filter((p) => p.stage === stage.stage);
  const minComplete =
    stage.started_at && targets.duration
      ? fmtTime(
          new Date(new Date(stage.started_at).getTime() + targets.duration * 60000).toISOString(),
        )
      : null;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold">{meta.label}</p>
          <p className="mt-0.5 text-[13px] text-muted">
            {formatBar(targets.pressure)} · {formatDuration(targets.duration)}
          </p>
        </div>
        {stage.status === "complete" ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-pass">
            <StatusDot tone="pass" /> Done
          </span>
        ) : stage.status === "in_progress" ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-progress">
            <StatusDot tone="progress" /> Running
          </span>
        ) : null}
      </div>

      {stage.status === "not_started" && !locked ? (
        <Button
          className="mt-3 w-full"
          onClick={() => handleAction("start")}
          disabled={busy !== null}
        >
          {busy === "start" ? "…" : needsPhoto ? "Photo & start" : "Start"}
        </Button>
      ) : null}

      {stage.status === "in_progress" ? (
        <>
          <p className="mt-2 text-[12px] text-muted">
            Started {fmtTime(stage.started_at!)}
            {minComplete ? ` · Minimum complete ${minComplete}` : ""}
            {stage.started_by ? ` · ${memberNames[stage.started_by] ?? "Someone"}` : ""}
          </p>
          {!locked ? (
            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={() => handleAction("complete")}
              disabled={busy !== null}
            >
              {busy === "complete" ? "…" : needsPhoto ? "Photo & complete" : "Complete"}
            </Button>
          ) : null}
        </>
      ) : null}

      {stage.status === "complete" ? (
        <p className="mt-2 text-[12px] text-muted">
          Started {fmtTime(stage.started_at!)} · Ended {fmtTime(stage.completed_at!)} · Actual{" "}
          {elapsedLabel(stage.started_at!, stage.completed_at!)}
        </p>
      ) : null}

      {stagePhotos.length > 0 ? (
        <div className="mt-3 flex gap-2">
          {stagePhotos.map((p) =>
            p.url ? (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={`${p.kind} photo`}
                  className="size-16 rounded-lg border border-line object-cover"
                />
              </a>
            ) : null,
          )}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-[12px] text-fail">{error}</p> : null}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFile}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Settings gear
// ---------------------------------------------------------------------------
function SettingsSheet({
  test,
  open,
  onClose,
}: {
  test: PressureTest;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const rows: { key: StageKey; label: string; p: number; d: number }[] = [
    {
      key: "initial",
      label: "Initial",
      p: test.initial_pressure_bar,
      d: test.initial_duration_min,
    },
    {
      key: "strength",
      label: "Strength",
      p: test.strength_pressure_bar,
      d: test.strength_duration_min,
    },
    {
      key: "pressure",
      label: "Pressure",
      p: test.pressure_pressure_bar,
      d: test.pressure_duration_min,
    },
  ];

  return (
    <Sheet open={open} onClose={onClose} title="Test settings">
      <p className="mb-4 text-[13px] text-muted">
        These values apply to this test only. Company defaults are unchanged.
      </p>
      <form
        action={(fd) => {
          start(async () => {
            const res = await updateTestSettingsAction({}, fd);
            if (res.error) setError(res.error);
            else {
              setError(null);
              router.refresh();
              onClose();
            }
          });
        }}
        className="space-y-4"
      >
        <input type="hidden" name="test_id" value={test.id} />
        {rows.map((r) => (
          <div key={r.key}>
            <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">
              {r.label} test
            </span>
            <div className="flex gap-2">
              <label className="flex-1">
                <input
                  name={`${r.key}_pressure_bar`}
                  type="number"
                  step="0.1"
                  min="0"
                  defaultValue={r.p}
                  className="w-full rounded-xl border border-line-strong px-3 py-2.5"
                  aria-label={`${r.label} pressure (bar)`}
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
                  aria-label={`${r.label} duration (minutes)`}
                />
                <span className="mt-1 block text-[11px] text-faint">minutes</span>
              </label>
            </div>
          </div>
        ))}
        <FormError>{error}</FormError>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "Save for this test"}
        </Button>
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Result + retest controls
// ---------------------------------------------------------------------------
function ResultControls({ test }: { test: PressureTest }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doResult = async (r: "passed" | "failed") => {
    setBusy(r);
    setError(null);
    const res = await setTestResultAction(test.id, r);
    setBusy(null);
    if (res.error) setError(res.error);
    else router.refresh();
  };

  const doRetest = async () => {
    setBusy("retest");
    setError(null);
    const res = await createRetestAction(test.id);
    if (res?.error) {
      setBusy(null);
      setError(res.error);
    }
  };

  if (test.status === "in_progress") {
    return (
      <Card className="mt-6 p-4">
        <p className="mb-3 text-[14px] font-semibold">Record the result</p>
        <div className="flex gap-2">
          <Button
            className="flex-1 bg-pass text-paper hover:bg-pass/90"
            onClick={() => doResult("passed")}
            disabled={busy !== null}
          >
            {busy === "passed" ? "…" : "Pass"}
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => doResult("failed")}
            disabled={busy !== null}
          >
            {busy === "failed" ? "…" : "Fail"}
          </Button>
        </div>
        {error ? <p className="mt-2 text-[12px] text-fail">{error}</p> : null}
      </Card>
    );
  }

  if (test.status === "passed" || test.status === "failed" || test.status === "void") {
    return (
      <div className="mt-6">
        <Button
          variant="secondary"
          className="w-full"
          onClick={doRetest}
          disabled={busy !== null}
        >
          {busy === "retest" ? "Creating retest…" : "Retest"}
        </Button>
        {error ? <p className="mt-2 text-center text-[12px] text-fail">{error}</p> : null}
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export function TestDetail({
  test,
  stages,
  photos,
  memberNames,
  companyId,
  projectName,
  sourceRef,
  sourceId,
  retests,
}: Props) {
  const router = useRouter();
  const [gearOpen, setGearOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [voidPending, startVoid] = useTransition();

  const statusMeta = TEST_STATUS_META[test.status];
  const orderedStages = STAGE_ORDER.map((k) => stages.find((s) => s.stage === k)).filter(
    Boolean,
  ) as TestStage[];

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Muted>{test.ref}</Muted>
        {!test.locked && test.status !== "void" ? (
          <button
            onClick={() => setGearOpen(true)}
            aria-label="Test settings"
            className="grid size-9 place-items-center rounded-full text-muted hover:bg-canvas"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M19.4 13a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.2.61.79 1.05 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
          </button>
        ) : null}
      </div>

      <h1 className="text-[22px] font-semibold tracking-tight">{projectName}</h1>
      <p className="mt-0.5 text-[14px] text-ink-soft">
        {floorLabel(test.floor)} <span className="text-faint">›</span> {systemLabel(test)}
      </p>
      <p className="text-[14px] text-muted">{test.area}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-[12px] font-medium">
          <StatusDot tone={statusMeta.tone} />
          {statusMeta.label}
        </span>
        {test.locked ? (
          <span className="rounded-full bg-canvas px-2.5 py-1 text-[12px] font-medium text-muted">
            Locked — evidence can&rsquo;t be edited
          </span>
        ) : null}
        {sourceRef && sourceId ? (
          <Link
            href={`/projects/${test.project_id}/tests/${sourceId}`}
            className="rounded-full bg-canvas px-2.5 py-1 text-[12px] font-medium text-muted underline underline-offset-2"
          >
            Retest of {sourceRef}
          </Link>
        ) : null}
      </div>

      {test.status === "void" && test.void_reason ? (
        <p className="mt-3 rounded-xl bg-canvas px-3.5 py-2.5 text-[13px] text-muted">
          Voided: {test.void_reason}
        </p>
      ) : null}

      <div className="mt-6 space-y-3">
        {orderedStages.map((s) => (
          <StageCard
            key={s.id}
            test={test}
            stage={s}
            photos={photos}
            companyId={companyId}
            memberNames={memberNames}
            locked={test.locked || test.status === "void"}
          />
        ))}
      </div>

      <ResultControls test={test} />

      {retests.length > 0 ? (
        <div className="mt-6">
          <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
            Retests
          </p>
          <div className="space-y-1.5">
            {retests.map((r) => (
              <Link
                key={r.id}
                href={`/projects/${test.project_id}/tests/${r.id}`}
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

      <ProvenanceBlock test={test} stages={orderedStages} photos={photos} memberNames={memberNames} />

      {test.status !== "void" ? (
        <button
          onClick={() => setVoidOpen(true)}
          className="mx-auto mt-8 block text-[12px] font-medium text-faint underline underline-offset-2"
        >
          Void this test
        </button>
      ) : null}

      <SettingsSheet test={test} open={gearOpen} onClose={() => setGearOpen(false)} />

      <Sheet open={voidOpen} onClose={() => setVoidOpen(false)} title="Void this test">
        <p className="mb-4 text-[13px] text-muted">
          The record is kept for the audit trail but removed from normal use. This can&rsquo;t be
          undone.
        </p>
        <form
          action={(fd) => {
            startVoid(async () => {
              const res = await voidTestAction({}, fd);
              if (res.error) setVoidError(res.error);
              else {
                setVoidError(null);
                router.refresh();
                setVoidOpen(false);
              }
            });
          }}
          className="space-y-3"
        >
          <input type="hidden" name="test_id" value={test.id} />
          <input
            name="reason"
            placeholder="Reason (optional)"
            className="w-full rounded-xl border border-line-strong px-3.5 py-3"
          />
          <FormError>{voidError}</FormError>
          <Button type="submit" variant="danger" size="lg" className="w-full" disabled={voidPending}>
            {voidPending ? "Voiding…" : "Void test"}
          </Button>
        </form>
      </Sheet>
    </div>
  );
}

function ProvenanceBlock({
  test,
  stages,
  photos,
  memberNames,
}: {
  test: PressureTest;
  stages: TestStage[];
  photos: PhotoView[];
  memberNames: Record<string, string>;
}) {
  const firstStart = stages
    .filter((s) => s.started_at)
    .sort((a, b) => a.started_at!.localeCompare(b.started_at!))[0];
  const lastComplete = stages
    .filter((s) => s.completed_at)
    .sort((a, b) => b.completed_at!.localeCompare(a.completed_at!))[0];

  const rows: [string, string][] = [];
  if (firstStart?.started_by)
    rows.push([
      "Started by",
      `${memberNames[firstStart.started_by] ?? "Someone"} · ${fmtDateTime(firstStart.started_at!)}`,
    ]);
  if (lastComplete?.completed_by)
    rows.push([
      "Completed by",
      `${memberNames[lastComplete.completed_by] ?? "Someone"} · ${fmtDateTime(
        lastComplete.completed_at!,
      )}`,
    ]);
  if (test.result_at && test.result_by)
    rows.push([
      test.status === "passed" ? "Passed by" : test.status === "failed" ? "Failed by" : "Result by",
      `${memberNames[test.result_by] ?? "Someone"} · ${fmtDateTime(test.result_at)}`,
    ]);
  rows.push(["Evidence photos", String(photos.length)]);
  rows.push(["ProofPod ID", test.ref]);

  if (rows.length === 0) return null;

  return (
    <dl className="mt-8 space-y-2 border-t border-line pt-4">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 text-[12px]">
          <dt className="text-faint">{k}</dt>
          <dd className="text-right text-muted">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
