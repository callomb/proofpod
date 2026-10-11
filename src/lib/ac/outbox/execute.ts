"use client";

import { createClient } from "@/lib/supabase/client";
import {
  completeAcEvacuationAction,
  completeAcPressureTestStageAction,
  createAcDrainTestAction,
  recordAcPhotoAction,
  saveAcEvacuationChecklistAction,
  setAcPressureTestResultAction,
  startAcPressureTestStageAction,
  updateAcChargeAction,
  updateAcCommissioningAction,
  updateAcUnitAction,
  upsertAcTemperatureReadingAction,
} from "../actions";
import type { ExecOutcome } from "./core";
import type { OutboxOp } from "./types";

const TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 40;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function isTransientStorageError(e: { message?: string; name?: string }): boolean {
  const msg = (e.message ?? "").toLowerCase();
  return (
    e.name === "StorageUnknownError" ||
    /failed to fetch|network|load failed|fetch|timeout|offline/.test(msg) ||
    (typeof navigator !== "undefined" && !navigator.onLine)
  );
}

function isDuplicateStorageError(e: { message?: string; statusCode?: string | number }): boolean {
  return String(e.statusCode) === "409" || /already exists|duplicate/i.test(e.message ?? "");
}

type Result = { error?: string };
const fromResult = (r: Result): ExecOutcome => (r.error ? { kind: "server", error: r.error } : { kind: "ok" });

async function run(op: OutboxOp): Promise<ExecOutcome> {
  const { spec, capturedAt } = op;
  switch (spec.kind) {
    case "photo": {
      if (!op.blob) return { kind: "server", error: "The photo is no longer on this phone." };
      const supabase = createClient();
      const { error } = await supabase.storage
        .from("evidence")
        .upload(spec.path, op.blob, { contentType: spec.contentType, upsert: false });
      if (error && !isDuplicateStorageError(error)) {
        return isTransientStorageError(error) ? { kind: "transient" } : { kind: "server", error: error.message };
      }
      return fromResult(await recordAcPhotoAction({ ...spec.record, storagePath: spec.path, takenAt: capturedAt }));
    }
    case "stage":
      return fromResult(
        spec.action === "start"
          ? await startAcPressureTestStageAction(spec.stageId, capturedAt)
          : await completeAcPressureTestStageAction(spec.stageId, capturedAt),
      );
    case "pressureResult":
      return fromResult(await setAcPressureTestResultAction(spec.attemptId, spec.result, capturedAt));
    case "evacChecklist":
      return fromResult(await saveAcEvacuationChecklistAction(spec.acSystemId, spec.checklist));
    case "evacComplete":
      return fromResult(await completeAcEvacuationAction(spec.acSystemId, capturedAt));
    case "charge":
      return fromResult(await updateAcChargeAction(spec.input));
    case "commissioning":
      return fromResult(
        await updateAcCommissioningAction(
          spec.acSystemId,
          spec.fields as Parameters<typeof updateAcCommissioningAction>[1],
        ),
      );
    case "temperature":
      return fromResult(await upsertAcTemperatureReadingAction({ ...spec.input, capturedAt }));
    case "drain":
      return fromResult(await createAcDrainTestAction({ ...spec.input, capturedAt }));
    case "unit":
      return fromResult(await updateAcUnitAction(spec.input));
  }
}

/** One attempt at sending an op. Anything that throws (no signal, timeout) counts as "try again later". */
export async function executeOp(op: OutboxOp): Promise<ExecOutcome> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { kind: "transient" };
  if (op.attempts >= MAX_ATTEMPTS) {
    return { kind: "server", error: "Couldn't be sent after many tries. Check your signal, then tap Retry." };
  }
  try {
    return await withTimeout(run(op), TIMEOUT_MS);
  } catch {
    return { kind: "transient" };
  }
}
