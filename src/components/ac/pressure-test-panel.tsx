"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import {
  completeAcPressureTestAttemptAction,
  createAcPressureTestAttemptAction,
  recordAcPhotoAction,
  setAcPressureTestResultAction,
  startAcPressureTestAttemptAction,
} from "@/lib/ac/actions";
import type { AcPhoto, AcPressureTest } from "@/lib/ac/types";
import { Button, Card, FormError, Muted, StatusDot, inputClass } from "../ui";

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

function PhotoThumb({ url, label }: { url: string | null; label: string }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="h-20 w-20 rounded-lg object-cover" />
    </a>
  );
}

export function PressureTestPanel({
  acSystemId,
  folderId,
  companyId,
  projectId,
  attempts,
  photos,
  photoUrls,
  memberNames,
}: {
  /** Null for a standalone pressure test (no System) — the panel is only ever
   *  shown once the first attempt already exists (created on its own small
   *  form), so this only affects the retest path here. */
  acSystemId: string | null;
  /** Storage-path grouping id — the system id, or the lineage id for standalone. */
  folderId: string;
  companyId: string;
  projectId: string;
  attempts: AcPressureTest[];
  photos: AcPhoto[];
  photoUrls: Record<string, string>;
  memberNames: Record<string, string>;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<{ kind: "start" | "end"; attemptId: string } | null>(null);

  const [startPressure, setStartPressure] = useState("");
  const [startNotes, setStartNotes] = useState("");
  const [endPressure, setEndPressure] = useState("");
  const [duration, setDuration] = useState("");
  const [endNotes, setEndNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = attempts[0];
  const history = attempts.slice(1);

  const photoFor = (attemptId: string, subject: "pressure_start" | "pressure_end") =>
    photos.find((p) => p.ac_pressure_test_id === attemptId && p.subject === subject);

  const beginPhotoCapture = (kind: "start" | "end", attemptId: string) => {
    pending.current = { kind, attemptId };
    fileRef.current?.click();
  };

  const startNew = async () => {
    if (!startPressure) {
      setError("Enter the starting test pressure.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await createAcPressureTestAttemptAction({
      acSystemId,
      projectId: acSystemId ? undefined : projectId,
      retestOf: current?.status === "failed" ? current.id : null,
    });
    setBusy(false);
    if (res.error || !res.id) {
      setError(res.error ?? "Couldn't start a new attempt.");
      return;
    }
    beginPhotoCapture("start", res.id);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const job = pending.current;
    if (!file || !job) return;
    setBusy(true);
    setError(null);
    try {
      const path = await uploadEvidence(file, { companyId, projectId, folderId });
      const rec = await recordAcPhotoAction({
        acSystemId,
        projectId: acSystemId ? undefined : projectId,
        acPressureTestId: job.attemptId,
        storagePath: path,
        subject: job.kind === "start" ? "pressure_start" : "pressure_end",
        mime: file.type,
        sizeBytes: file.size,
      });
      if (rec.error) throw new Error(rec.error);

      if (job.kind === "start") {
        const res = await startAcPressureTestAttemptAction({
          attemptId: job.attemptId,
          startPressureBar: Number(startPressure),
          notes: startNotes || null,
        });
        if (res.error) throw new Error(res.error);
        setStartPressure("");
        setStartNotes("");
      } else {
        if (!endPressure || !duration) throw new Error("Enter the final pressure and test duration first.");
        const res = await completeAcPressureTestAttemptAction({
          attemptId: job.attemptId,
          endPressureBar: Number(endPressure),
          testDurationMin: Number(duration),
          notes: endNotes || null,
        });
        if (res.error) throw new Error(res.error);
        setEndPressure("");
        setDuration("");
        setEndNotes("");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      pending.current = null;
    }
  };

  const setResult = async (result: "passed" | "failed") => {
    if (!current) return;
    setBusy(true);
    setError(null);
    const res = await setAcPressureTestResultAction(current.id, result);
    setBusy(false);
    if (res.error) setError(res.error);
    else router.refresh();
  };

  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />

      {!current ? (
        <Card className="p-4">
          <p className="mb-3 text-[14px] font-semibold">Start pressure test</p>
          <label className="mb-3 block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">
              Starting test pressure (bar)
            </span>
            <input
              value={startPressure}
              onChange={(e) => setStartPressure(e.target.value)}
              inputMode="decimal"
              className={inputClass}
              placeholder="e.g. 15"
            />
          </label>
          <label className="mb-3 block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Notes (optional)</span>
            <input
              value={startNotes}
              onChange={(e) => setStartNotes(e.target.value)}
              className={inputClass}
            />
          </label>
          <Muted className="mb-3 block">
            Tapping below opens the camera — photograph the gauges, then the start time is recorded.
          </Muted>
          <Button size="lg" className="w-full" disabled={busy} onClick={startNew}>
            {busy ? "Working…" : "Photograph gauges & start"}
          </Button>
        </Card>
      ) : current.status === "in_progress" && !current.started_at ? (
        <Card className="p-4">
          <p className="mb-3 text-[14px] font-semibold">Attempt {current.attempt_no} — start photo needed</p>
          <Button
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={() => beginPhotoCapture("start", current.id)}
          >
            {busy ? "Working…" : "Photograph gauges & start"}
          </Button>
        </Card>
      ) : current.status === "in_progress" && !current.completed_at ? (
        <Card className="p-4">
          <p className="mb-1 text-[14px] font-semibold">Attempt {current.attempt_no} — in progress</p>
          <p className="mb-3 text-[13px] text-muted">
            Started {current.started_at ? fmtDateTime(current.started_at) : ""} at {current.start_pressure_bar} bar
          </p>
          <PhotoThumb url={photoUrls[photoFor(current.id, "pressure_start")?.storage_path ?? ""] ?? null} label="Start photo" />

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Pressure after test (bar)</span>
              <input value={endPressure} onChange={(e) => setEndPressure(e.target.value)} inputMode="decimal" className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Duration (min)</span>
              <input value={duration} onChange={(e) => setDuration(e.target.value)} inputMode="numeric" className={inputClass} />
            </label>
          </div>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Notes (optional)</span>
            <input value={endNotes} onChange={(e) => setEndNotes(e.target.value)} className={inputClass} />
          </label>
          <Muted className="mt-2 block">
            Tapping below opens the camera — photograph the gauges, then the end time is recorded.
          </Muted>
          <Button
            size="lg"
            className="mt-3 w-full"
            disabled={busy || !endPressure || !duration}
            onClick={() => beginPhotoCapture("end", current.id)}
          >
            {busy ? "Working…" : "Photograph gauges & complete"}
          </Button>
        </Card>
      ) : current.status === "in_progress" && current.completed_at ? (
        <Card className="p-4">
          <p className="mb-1 text-[14px] font-semibold">Attempt {current.attempt_no} — result?</p>
          <p className="mb-3 text-[13px] text-muted">
            {current.start_pressure_bar} bar → {current.end_pressure_bar} bar over {current.test_duration_min} min
          </p>
          <div className="flex gap-3">
            <PhotoThumb url={photoUrls[photoFor(current.id, "pressure_start")?.storage_path ?? ""] ?? null} label="Start photo" />
            <PhotoThumb url={photoUrls[photoFor(current.id, "pressure_end")?.storage_path ?? ""] ?? null} label="End photo" />
          </div>
          <div className="mt-4 flex gap-3">
            <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => setResult("failed")}>
              Fail
            </Button>
            <Button className="flex-1" disabled={busy} onClick={() => setResult("passed")}>
              Pass
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <StatusDot tone={current.status === "passed" ? "pass" : "fail"} />
            <p className="text-[14px] font-semibold">
              Attempt {current.attempt_no} — {current.status === "passed" ? "Passed" : "Failed"}
            </p>
          </div>
          <p className="mt-1 text-[13px] text-muted">
            {current.start_pressure_bar} bar → {current.end_pressure_bar} bar over {current.test_duration_min} min
            {current.result_by ? ` · ${memberNames[current.result_by] ?? "Someone"}` : ""}
          </p>
          <div className="mt-3 flex gap-3">
            <PhotoThumb url={photoUrls[photoFor(current.id, "pressure_start")?.storage_path ?? ""] ?? null} label="Start photo" />
            <PhotoThumb url={photoUrls[photoFor(current.id, "pressure_end")?.storage_path ?? ""] ?? null} label="End photo" />
          </div>
          {current.status === "failed" ? (
            <>
              <label className="mt-4 mb-1.5 block text-[13px] font-medium text-ink-soft">
                Starting test pressure for the retest (bar)
              </label>
              <input
                value={startPressure}
                onChange={(e) => setStartPressure(e.target.value)}
                inputMode="decimal"
                className={inputClass}
              />
              <Button size="lg" className="mt-3 w-full" disabled={busy} onClick={startNew}>
                Repair &amp; retest
              </Button>
            </>
          ) : null}
        </Card>
      )}

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
