import type { AcPhotoSubject } from "../types";

export interface PhotoRecord {
  subject: AcPhotoSubject;
  acSystemId?: string | null;
  projectId?: string | null;
  acUnitId?: string | null;
  acPressureTestId?: string | null;
  stageNo?: number | null;
  mime?: string | null;
  sizeBytes?: number | null;
}

interface Base {
  /** Ops in the same lane are sent strictly in order; a failure holds back only that lane. */
  lane: string;
  /** The system (or standalone-test folder) this belongs to, for "waiting to send" counts. */
  scope: string;
}

export type OpSpec =
  | (Base & { kind: "photo"; path: string; contentType: string; record: PhotoRecord })
  | (Base & { kind: "stage"; stageId: string; action: "start" | "complete" })
  | (Base & { kind: "pressureResult"; attemptId: string; result: "passed" | "failed" })
  | (Base & { kind: "evacChecklist"; acSystemId: string; checklist: Record<string, boolean> })
  | (Base & { kind: "evacComplete"; acSystemId: string })
  | (Base & {
      kind: "charge";
      input: {
        acSystemId: string;
        factoryChargeKg?: number | null;
        factoryPipeAllowanceM?: number | null;
        installedPipeLengthM?: number | null;
        additionalMethod?: "manual" | "calculated" | null;
        actualAdditionalKg?: number | null;
      };
    })
  | (Base & { kind: "commissioning"; acSystemId: string; fields: Record<string, unknown> })
  | (Base & {
      kind: "temperature";
      input: { acUnitId: string; mode: "cooling" | "heating"; airOnC?: number | null; airOffC?: number | null };
    })
  | (Base & {
      kind: "drain";
      input: {
        acUnitId: string;
        drainType: "pump" | "gravity";
        result: "passed" | "failed";
        pumpModel?: string | null;
        waterAddedLitres?: number | null;
        notes?: string | null;
      };
    })
  | (Base & {
      kind: "unit";
      input: {
        unitId: string;
        reference?: string | null;
        location?: string | null;
        assetNumber?: string | null;
        modelNumber?: string | null;
        serialNumber?: string | null;
        manufactureDate?: string | null;
      };
    });

export type OpStatus = "pending" | "failed" | "synced";

export interface OutboxOp {
  id: string;
  seq: number;
  /** When the user did it on site (phone clock) — sent to the server as the event time. */
  capturedAt: string;
  createdAt: string;
  status: OpStatus;
  attempts: number;
  error?: string;
  spec: OpSpec;
  blob?: Blob;
}

export type EnqueueResult =
  | { status: "done" }
  | { status: "queued" }
  | { status: "error"; error: string };
