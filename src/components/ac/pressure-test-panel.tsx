"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import {
  completeAcPressureTestStageAction,
  createAcPressureTestAttemptAction,
  recordAcPhotoAction,
  setAcPressureTestResultAction,
  startAcPressureTestStageAction,
} from "@/lib/ac/actions";
import type { AcPhoto, AcPressureTest, AcPressureTestStage } from "@/lib/ac/types";
import { Button, Card, FormError, LinkButton, Muted, StatusDot } from "../ui";

async function uploadEvidence(
  file: File,
  opts: { companyId: string; projectId: string; folderId: string },
): Promise<string> {
  const supabase = createClient();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${opts.companyId}/${opts.projectId}/${opts.folderId}/${crypto.randomUUID()}.${ext || "jpg"}`;
  const { error } = await supabase.storage
    .from("evidence")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(min: number | null) {
  if (min === null) return "until system is evacuated";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function PhotoThumb({ url, label }: { url: string | null; label: string }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="h-16 w-16 rounded-lg object-cover" />
    </a>
  );
}

function StageRow({
  stage,
  photos,
  photoUrls,
  memberNames,
  locked,
  busy,
  onStart,
  onComplete,
}: {
  stage: AcPressureTestStage;
  photos: AcPhoto[];
  photoUrls: Record<string, string>;
  memberNames: Record<string, string>;
  locked: boolean;
  busy: boolean;
  onStart: () => void;
  onComplete: () => void;
}) {
  const startPhoto = photos.find((p) => p.stage_no === stage.stage_no && p.subject === "pressure_start");
  const endPhoto = photos.find((p) => p.stage_no === stage.stage_no && p.subject === "pressure_end");

  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-[14px] font-medium">
          Stage {stage.stage_no} · {stage.target_pressure_bar} bar · {fmtDuration(stage.target_duration_min)}
        </p>
        <p className="mt-0.5 text-[12px] text-muted">
          {stage.status === "not_started" && "Not started"}
          {stage.status === "in_progress" &&
            `Started ${stage.started_at ? fmtDateTime(stage.started_at) : ""}${stage.started_by ? ` · ${memberNames[stage.started_by] ?? "Someone"}` : ""}`}
          {stage.status === "complete" &&
            `Completed ${stage.completed_at ? fmtDateTime(stage.completed_at) : ""}${stage.completed_by ? ` · ${memberNames[stage.completed_by] ?? "Someone"}` : ""}`}
        </p>
        {startPhoto || endPhoto ? (
          <div className="mt-2 flex gap-2">
            <PhotoThumb url={startPhoto ? (photoUrls[startPhoto.storage_path] ?? null) : null} label={`Stage ${stage.stage_no} start`} />
            <PhotoThumb url={endPhoto ? (photoUrls[endPhoto.storage_path] ?? null) : null} label={`Stage ${stage.stage_no} end`} />
          </div>
        ) : null}
      </div>
      <div className="shrink-0">
        {stage.status === "not_started" ? (
          <Button size="sm" variant="secondary" disabled={locked || busy} onClick={onStart}>
            {busy ? "…" : stage.requires_photo ? "Photograph & start" : "Start"}
          </Button>
        ) : stage.status === "in_progress" ? (
          <Button size="sm" disabled={locked || busy} onClick={onComplete}>
            {busy ? "…" : stage.requires_photo ? "Photograph & complete" : "Complete"}
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted">
            <StatusDot tone="pass" />
            Done
          </span>
        )}
      </div>
    </div>
  );
}

export function PressureTestPanel({
  acSystemId,
  folderId,
  companyId,
  projectId,
  attempts,
  stages,
  photos,
  photoUrls,
  memberNames,
  doneHref,
  doneLabel,
}: {
  /** Null for a standalone pressure test (no System) — only affects the retest path here. */
  acSystemId: string | null;
  /** Storage-path grouping id — the system id, or the lineage id for standalone. */
  folderId: string;
  companyId: string;
  projectId: string;
  attempts: AcPressureTest[];
  stages: AcPressureTestStage[];
  photos: AcPhoto[];
  photoUrls: Record<string, string>;
  memberNames: Record<string, string>;
  doneHref: string;
  doneLabel: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<{ stageId: string; stageNo: number; action: "start" | "complete" } | null>(null);

  const [busyStageId, setBusyStageId] = useState<string | null>(null);
  const [resultBusy, setResultBusy] = useState(false);
  const [retestBusy, setRetestBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = attempts[0];
  const history = attempts.slice(1);
  const currentStages = stages
    .filter((s) => s.ac_pressure_test_id === current?.id)
    .sort((a, b) => a.stage_no - b.stage_no);

  const runStage = async (stageId: string, action: "start" | "complete", requiresPhoto: boolean, stageNo: number) => {
    if (requiresPhoto) {
      pending.current = { stageId, stageNo, action };
      fileRef.current?.click();
      return;
    }
    setBusyStageId(stageId);
    setError(null);
    const res =
      action === "start"
        ? await startAcPressureTestStageAction(stageId)
        : await completeAcPressureTestStageAction(stageId);
    setBusyStageId(null);
    if (res.error) setError(res.error);
    else router.refresh();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const job = pending.current;
    if (!file || !job) return;
    setBusyStageId(job.stageId);
    setError(null);
    try {
      const path = await uploadEvidence(file, { companyId, projectId, folderId });
      const rec = await recordAcPhotoAction({
        acSystemId,
        projectId: acSystemId ? undefined : projectId,
        acPressureTestId: current.id,
        stageNo: job.stageNo,
        storagePath: path,
        subject: job.action === "start" ? "pressure_start" : "pressure_end",
        mime: file.type,
        sizeBytes: file.size,
      });
      if (rec.error) throw new Error(rec.error);

      const res =
        job.action === "start"
          ? await startAcPressureTestStageAction(job.stageId)
          : await completeAcPressureTestStageAction(job.stageId);
      if (res.error) throw new Error(res.error);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusyStageId(null);
      pending.current = null;
    }
  };

  const setResult = async (result: "passed" | "failed") => {
    if (!current) return;
    setResultBusy(true);
    setError(null);
    const res = await setAcPressureTestResultAction(current.id, result);
    setResultBusy(false);
    if (res.error) setError(res.error);
    else router.refresh();
  };

  const startNew = async () => {
    setRetestBusy(true);
    setError(null);
    const res = await createAcPressureTestAttemptAction({
      acSystemId,
      projectId: acSystemId ? undefined : projectId,
      retestOf: current?.status === "failed" ? current.id : null,
    });
    setRetestBusy(false);
    if (res.error) setError(res.error);
    else router.refresh();
  };

  if (!current) {
    // Only reachable for a brand-new System-scoped test (standalone tests
    // are only ever shown here once their first attempt already exists).
    return (
      <Card className="p-4">
        <p className="mb-3 text-[14px] font-semibold">Start pressure test</p>
        <FormError>{error}</FormError>
        <Button size="lg" className="w-full" disabled={retestBusy} onClick={startNew}>
          {retestBusy ? "Starting…" : "Start"}
        </Button>
      </Card>
    );
  }

  const allComplete = currentStages.every((s) => s.status === "complete");

  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />

      <Card className="p-4">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[14px] font-semibold">Attempt {current.attempt_no}</p>
          {current.status !== "in_progress" ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
              <StatusDot tone={current.status === "passed" ? "pass" : "fail"} />
              {current.status === "passed" ? "Passed" : "Failed"}
            </span>
          ) : null}
        </div>
        <div>
          {currentStages.map((stage) => (
            <StageRow
              key={stage.id}
              stage={stage}
              photos={photos.filter((p) => p.ac_pressure_test_id === current.id)}
              photoUrls={photoUrls}
              memberNames={memberNames}
              locked={current.locked}
              busy={busyStageId === stage.id}
              onStart={() => runStage(stage.id, "start", stage.requires_photo, stage.stage_no)}
              onComplete={() => runStage(stage.id, "complete", stage.requires_photo, stage.stage_no)}
            />
          ))}
        </div>

        {current.status === "in_progress" ? (
          <div className="mt-4 flex gap-3">
            <Muted className="flex-1 self-center">
              {allComplete ? "All stages done — record the result." : "Result can be recorded any time."}
            </Muted>
            <Button variant="secondary" disabled={resultBusy} onClick={() => setResult("failed")}>
              Fail
            </Button>
            <Button disabled={resultBusy} onClick={() => setResult("passed")}>
              Pass
            </Button>
          </div>
        ) : null}

        {current.status === "failed" ? (
          <Button size="lg" className="mt-4 w-full" disabled={retestBusy} onClick={startNew}>
            {retestBusy ? "Working…" : "Repair & retest"}
          </Button>
        ) : null}

        {current.status !== "in_progress" ? (
          <LinkButton
            href={doneHref}
            variant={current.status === "passed" ? "primary" : "secondary"}
            size="lg"
            className="mt-3 w-full"
          >
            Back to {doneLabel}
          </LinkButton>
        ) : null}
      </Card>

      <FormError>{error}</FormError>

      {history.length > 0 ? (
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-soft">Previous attempts</p>
          <div className="space-y-2">
            {history.map((a) => (
              <Card key={a.id} className="flex items-center justify-between p-3">
                <span className="text-[13px]">Attempt {a.attempt_no}</span>
                <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
                  <StatusDot tone={a.status === "passed" ? "pass" : a.status === "failed" ? "fail" : "progress"} />
                  {a.status === "passed" ? "Passed" : a.status === "failed" ? "Failed" : "In progress"}
                </span>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
